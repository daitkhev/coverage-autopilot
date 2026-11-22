import {
  type Environment,
  setValue,
  setValues,
} from '#infrastructure/config/environment-values';
import { InvalidServiceConfigError } from '#infrastructure/config/errors/invalid-service-config.error';
import {
  type GeneratorChoice,
  generatorOf,
} from '#infrastructure/config/generator-config';
import {
  instanceDirectoryOf,
  instanceIdOf,
  type InstancePaths,
  instancePaths,
} from '#infrastructure/config/instance-paths';
import {
  type Problem,
  type ServiceEnvironment,
  serviceEnvironmentSchema,
  TOKENS_WITH_A_KEY,
  type Variable,
  VARIABLES,
} from '#infrastructure/config/service-environment.schema';
import type { LogLevel } from '#infrastructure/logging/log-settings';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';

/** The user and the group the service runs as, from the entry file. */
export interface ProcessUser {
  readonly uid: number;
  readonly gid: number;
}

interface QueueSettings {
  readonly leaseMs: number;
  /** Always shorter than the lease. */
  readonly heartbeatMs: number;
  /** Claims of one job before it is dead. */
  readonly maxRuns: number;
  readonly pollMs: number;
  /** Jobs of different repositories that run at once. */
  readonly concurrency: number;
}

/** No limit of tokens under a subscription: its windows limit it. */
interface Budget {
  readonly attempts: number;
  readonly minutes: number;
  readonly tokens: number | null;
}

/** The time limits of the commands of a repository, run in the sandbox. */
interface CommandLimits {
  /** The install is the one command with the network. */
  readonly installTimeoutMs: number;
  readonly testRunTimeoutMs: number;
  readonly typeCheckTimeoutMs: number;
  /** A whole run of the mutation tool, which limits one mutant only. */
  readonly mutationRunTimeoutMs: number;
  /** The test runners of one run of the mutation tool at once. */
  readonly mutationConcurrency: number;
}

/** How the service starts a program on its own host. */
interface HostTool {
  /** Exactly the variables it is started with. Nothing else reaches it. */
  readonly environment: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

/** Everything the service is started with, read once and frozen. */
export interface ServiceConfig {
  readonly instance: InstancePaths;
  readonly logLevel: LogLevel;
  /** Credentials of the environment, for the logger to replace. */
  readonly secrets: readonly string[];
  readonly sandbox: SandboxSettings;
  readonly queue: QueueSettings;
  /**
   * The percent of lines a file of a repository is judged by when the
   * repository has no threshold of its own.
   */
  readonly coverageThreshold: number;
  readonly commands: CommandLimits;
  readonly generator: GeneratorChoice;
  readonly budget: {
    readonly defaults: Budget;
    readonly maximums: Budget;
  };
  readonly git: HostTool;
  readonly gh: HostTool;
}

/** The injection token of the configuration of the service. */
export const SERVICE_CONFIG = Symbol('ServiceConfig');

/**
 * What the program of the engine needs to find itself, its settings and
 * its engine. Nothing else of the service reaches it.
 */
const ENGINE_VARIABLES = [
  'PATH',
  'HOME',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
  'DOCKER_CERT_PATH',
  'DOCKER_TLS_VERIFY',
  'XDG_RUNTIME_DIR',
  'CONTAINER_HOST',
];

/**
 * Where git finds its programs, and the home that holds the configuration
 * of the operator, which a push needs for its credentials.
 */
const GIT_VARIABLES = ['PATH', 'HOME'];

/**
 * What `gh` needs to find its login: a token of CI or of isolated mode, or
 * its configuration under the home, and on Linux the keyring it may have
 * put the token in, which it reaches through the session bus.
 */
const GH_VARIABLES = [
  'PATH',
  'HOME',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_HOST',
  'GH_CONFIG_DIR',
  'XDG_CONFIG_HOME',
  'DBUS_SESSION_BUS_ADDRESS',
];

/** Where a credential is in CI and in isolated mode. */
const SECRET_VARIABLES = [
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
];

/**
 * A command of a repository writes into a working copy the service made,
 * so it runs as the user of the service unless a variable names another.
 * A service that runs as root gets 0 here, and the check refuses it.
 */
function fallbacksOf(user: ProcessUser): Readonly<Record<string, string>> {
  return {
    AUTOPILOT_SANDBOX_UID: String(user.uid),
    AUTOPILOT_SANDBOX_GID: String(user.gid),
  };
}

function inputOf(
  environment: Environment,
  user: ProcessUser,
): Record<string, unknown> {
  const table: Readonly<Record<string, Variable>> = VARIABLES;
  const ofTheProcess = fallbacksOf(user);
  return Object.fromEntries(
    Object.entries(table).map(([name, variable]) => [
      name,
      setValue(environment, name) ?? variable.fallback ?? ofTheProcess[name],
    ]),
  );
}

/** A relation names its own words. A field is named by the table. */
function problemsOf(
  issues: readonly { code: string; path: PropertyKey[]; message: string }[],
): Problem[] {
  const found = new Map<string, string>();
  for (const issue of issues) {
    const variable = String(issue.path[0]) as keyof typeof VARIABLES;
    const expected =
      issue.code === 'custom' ? issue.message : VARIABLES[variable].expected;
    found.set(variable, found.get(variable) ?? expected);
  }
  return [...found].map(([variable, expected]) => ({ variable, expected }));
}

function sandboxOf(
  values: ServiceEnvironment,
  environment: Environment,
  instance: InstancePaths,
): SandboxSettings {
  return {
    engine: {
      command: values.AUTOPILOT_SANDBOX_ENGINE,
      environment: setValues(environment, ENGINE_VARIABLES),
    },
    instance: instanceIdOf(instance),
    image: values.AUTOPILOT_SANDBOX_IMAGE,
    user:
      `${String(values.AUTOPILOT_SANDBOX_UID)}:` +
      String(values.AUTOPILOT_SANDBOX_GID),
    limits: {
      memoryMb: values.AUTOPILOT_SANDBOX_MEMORY_MB,
      cpus: values.AUTOPILOT_SANDBOX_CPUS,
      processes: values.AUTOPILOT_SANDBOX_PROCESSES,
      scratchMb: values.AUTOPILOT_SANDBOX_SCRATCH_MB,
      outputBytes: values.AUTOPILOT_SANDBOX_OUTPUT_BYTES,
    },
  };
}

function budgetOf(values: ServiceEnvironment): ServiceConfig['budget'] {
  const withKey = values.AUTOPILOT_GENERATOR_BILLING === 'api_key';
  const tokens = (name: keyof typeof TOKENS_WITH_A_KEY): number | null =>
    withKey ? (values[name] ?? TOKENS_WITH_A_KEY[name]) : null;
  return {
    defaults: {
      attempts: values.AUTOPILOT_BUDGET_ATTEMPTS,
      minutes: values.AUTOPILOT_BUDGET_MINUTES,
      tokens: tokens('AUTOPILOT_BUDGET_TOKENS'),
    },
    maximums: {
      attempts: values.AUTOPILOT_BUDGET_MAX_ATTEMPTS,
      minutes: values.AUTOPILOT_BUDGET_MAX_MINUTES,
      tokens: tokens('AUTOPILOT_BUDGET_MAX_TOKENS'),
    },
  };
}

/**
 * A commit on a working copy reads no configuration of git, so who commits
 * is given here, or git would make it up from the user and the machine.
 */
function gitOf(
  values: ServiceEnvironment,
  environment: Environment,
): ServiceConfig['git'] {
  const name = values.AUTOPILOT_GIT_AUTHOR_NAME;
  const email = values.AUTOPILOT_GIT_AUTHOR_EMAIL;
  return {
    environment: {
      ...setValues(environment, GIT_VARIABLES),
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
    },
    timeoutMs: values.AUTOPILOT_GIT_TIMEOUT_MS,
  };
}

function commandsOf(values: ServiceEnvironment): CommandLimits {
  return {
    installTimeoutMs: values.AUTOPILOT_INSTALL_TIMEOUT_MS,
    testRunTimeoutMs: values.AUTOPILOT_TEST_RUN_TIMEOUT_MS,
    typeCheckTimeoutMs: values.AUTOPILOT_TYPE_CHECK_TIMEOUT_MS,
    mutationRunTimeoutMs: values.AUTOPILOT_MUTATION_RUN_TIMEOUT_MS,
    mutationConcurrency: values.AUTOPILOT_MUTATION_CONCURRENCY,
  };
}

function configOf(
  values: ServiceEnvironment,
  environment: Environment,
): ServiceConfig {
  const instance = instancePaths(
    instanceDirectoryOf(values.AUTOPILOT_INSTANCE_DIR, values.HOME),
  );
  const sandbox = sandboxOf(values, environment, instance);
  return {
    instance,
    logLevel: values.AUTOPILOT_LOG_LEVEL,
    secrets: Object.values(setValues(environment, SECRET_VARIABLES)),
    sandbox,
    queue: {
      leaseMs: values.AUTOPILOT_QUEUE_LEASE_MS,
      heartbeatMs: values.AUTOPILOT_QUEUE_HEARTBEAT_MS,
      maxRuns: values.AUTOPILOT_QUEUE_MAX_RUNS,
      pollMs: values.AUTOPILOT_QUEUE_POLL_MS,
      concurrency: values.AUTOPILOT_QUEUE_CONCURRENCY,
    },
    coverageThreshold: values.AUTOPILOT_COVERAGE_THRESHOLD,
    commands: commandsOf(values),
    generator: generatorOf(values, environment, sandbox),
    budget: budgetOf(values),
    git: gitOf(values, environment),
    gh: {
      environment: setValues(environment, GH_VARIABLES),
      timeoutMs: values.AUTOPILOT_GH_TIMEOUT_MS,
    },
  };
}

function deepFreeze<T extends object>(value: T): T {
  for (const inner of Object.values(value as Record<string, unknown>)) {
    if (typeof inner === 'object' && inner !== null) {
      deepFreeze(inner);
    }
  }
  return Object.freeze(value);
}

/**
 * Reads the configuration from the variables it is given: the entry file
 * passes the environment of the process and the user it runs as, and
 * nothing else in the service reads them. A wrong value stops the start
 * with every wrong variable at once, and never with the value, which may
 * be a secret.
 */
export function loadServiceConfig(
  environment: Environment,
  user: ProcessUser,
): ServiceConfig {
  const parsed = serviceEnvironmentSchema.safeParse(inputOf(environment, user));
  if (!parsed.success) {
    const problems = problemsOf(parsed.error.issues).map(
      ({ variable, expected }) => `${variable}: expected ${expected}.`,
    );
    throw new InvalidServiceConfigError(
      `The service cannot start with its variables. ${problems.join(' ')}`,
    );
  }
  return deepFreeze(configOf(parsed.data, environment));
}
