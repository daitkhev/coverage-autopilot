import { InvalidServiceConfigError } from '#infrastructure/config/errors/invalid-service-config.error';
import {
  instanceDirectoryOf,
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

/** The variables as the entry file gets them. Empty is not set. */
type Environment = Readonly<Record<string, string | undefined>>;

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

/** Everything the service is started with, read once and frozen. */
export interface ServiceConfig {
  readonly instance: InstancePaths;
  readonly logLevel: LogLevel;
  /** Credentials of the environment, for the logger to replace. */
  readonly secrets: readonly string[];
  readonly sandbox: SandboxSettings;
  readonly queue: QueueSettings;
  readonly generator: {
    readonly cli: ServiceEnvironment['AUTOPILOT_GENERATOR'];
    readonly billing: ServiceEnvironment['AUTOPILOT_GENERATOR_BILLING'];
  };
  readonly budget: {
    readonly defaults: Budget;
    readonly maximums: Budget;
  };
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

/** Where a credential is in CI and in isolated mode. */
const SECRET_VARIABLES = [
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
];

function setValue(environment: Environment, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value === '' ? undefined : value;
}

function setValues(
  environment: Environment,
  names: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = setValue(environment, name);
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

function inputOf(environment: Environment): Record<string, unknown> {
  const table: Readonly<Record<string, Variable>> = VARIABLES;
  return Object.fromEntries(
    Object.entries(table).map(([name, variable]) => [
      name,
      setValue(environment, name) ?? variable.fallback,
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
): SandboxSettings {
  return {
    engine: {
      command: values.AUTOPILOT_SANDBOX_ENGINE,
      environment: setValues(environment, ENGINE_VARIABLES),
    },
    image: values.AUTOPILOT_SANDBOX_IMAGE,
    user: values.AUTOPILOT_SANDBOX_USER,
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

function configOf(
  values: ServiceEnvironment,
  environment: Environment,
): ServiceConfig {
  return {
    instance: instancePaths(
      instanceDirectoryOf(values.AUTOPILOT_INSTANCE_DIR, values.HOME),
    ),
    logLevel: values.AUTOPILOT_LOG_LEVEL,
    secrets: Object.values(setValues(environment, SECRET_VARIABLES)),
    sandbox: sandboxOf(values, environment),
    queue: {
      leaseMs: values.AUTOPILOT_QUEUE_LEASE_MS,
      heartbeatMs: values.AUTOPILOT_QUEUE_HEARTBEAT_MS,
      maxRuns: values.AUTOPILOT_QUEUE_MAX_RUNS,
      pollMs: values.AUTOPILOT_QUEUE_POLL_MS,
      concurrency: values.AUTOPILOT_QUEUE_CONCURRENCY,
    },
    generator: {
      cli: values.AUTOPILOT_GENERATOR,
      billing: values.AUTOPILOT_GENERATOR_BILLING,
    },
    budget: budgetOf(values),
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
 * passes the environment of the process, and nothing else in the service
 * reads it. A wrong value stops the start with every wrong variable at
 * once, and never with the value, which may be a secret.
 */
export function loadServiceConfig(environment: Environment): ServiceConfig {
  const parsed = serviceEnvironmentSchema.safeParse(inputOf(environment));
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
