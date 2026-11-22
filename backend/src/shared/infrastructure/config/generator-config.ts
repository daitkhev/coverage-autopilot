import {
  type Environment,
  setValue,
} from '#infrastructure/config/environment-values';
import {
  COST_WITH_A_KEY_USD,
  type ServiceEnvironment,
  VARIABLES,
} from '#infrastructure/config/service-environment.schema';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';

/** The one secret of the generator, and the variable the CLI reads it from. */
interface GeneratorCredential {
  readonly variable: string;
  /** `null` when the variable is not set: scans run, improvements cannot. */
  readonly value: string | null;
}

/** Which CLI writes the tests, who pays for it, and how one call is held. */
export interface GeneratorChoice {
  readonly cli: ServiceEnvironment['AUTOPILOT_GENERATOR'];
  readonly billing: ServiceEnvironment['AUTOPILOT_GENERATOR_BILLING'];
  readonly model: string;
  readonly credential: GeneratorCredential;
  /** The limits of one call. A price exists with a key alone. */
  readonly call: {
    readonly maxTurns: number;
    readonly maxCostUsd: number | null;
    readonly timeoutMs: number;
  };
  /** The wait for a window of a subscription the CLI did not say opens. */
  readonly limitWaitMs: number;
  /**
   * The second sandbox, the one the CLI runs in: the engine, the user and
   * the limits of the first, an image with the CLI, and an output limit
   * that keeps a whole run.
   */
  readonly sandbox: SandboxSettings;
}

/**
 * The variable the CLI logs in with under each way to pay. A subscription
 * logs in with the long-lived token `claude setup-token` makes, since the
 * CLI runs in a container and cannot reach the login of the host.
 */
const CREDENTIAL_VARIABLES = {
  subscription: 'CLAUDE_CODE_OAUTH_TOKEN',
  api_key: 'ANTHROPIC_API_KEY',
} as const;

function credentialOf(
  values: ServiceEnvironment,
  environment: Environment,
): GeneratorCredential {
  const variable = CREDENTIAL_VARIABLES[values.AUTOPILOT_GENERATOR_BILLING];
  return { variable, value: setValue(environment, variable) ?? null };
}

/**
 * The sandbox of the generator with the build of its image from `file`,
 * the file the service ships, when its variable names the default image:
 * no registry has that image, so the service makes it. A person who names
 * another image gets that image as the engine has it or pulls it.
 */
export function withShippedBuild(
  sandbox: SandboxSettings,
  file: string,
): SandboxSettings {
  return sandbox.image === VARIABLES.AUTOPILOT_GENERATOR_IMAGE.fallback
    ? { ...sandbox, build: { file } }
    : sandbox;
}

/** The generator of the variables, in the sandbox of the commands. */
export function generatorOf(
  values: ServiceEnvironment,
  environment: Environment,
  sandbox: SandboxSettings,
): GeneratorChoice {
  const withKey = values.AUTOPILOT_GENERATOR_BILLING === 'api_key';
  const maxCostUsd = values.AUTOPILOT_GENERATOR_MAX_COST_USD;
  return {
    cli: values.AUTOPILOT_GENERATOR,
    billing: values.AUTOPILOT_GENERATOR_BILLING,
    model: values.AUTOPILOT_GENERATOR_MODEL,
    credential: credentialOf(values, environment),
    call: {
      maxTurns: values.AUTOPILOT_GENERATOR_MAX_TURNS,
      maxCostUsd: withKey ? (maxCostUsd ?? COST_WITH_A_KEY_USD) : null,
      timeoutMs: values.AUTOPILOT_GENERATOR_TIMEOUT_MS,
    },
    limitWaitMs: values.AUTOPILOT_GENERATOR_LIMIT_WAIT_MS,
    sandbox: {
      ...sandbox,
      image: values.AUTOPILOT_GENERATOR_IMAGE,
      limits: {
        ...sandbox.limits,
        outputBytes: values.AUTOPILOT_GENERATOR_OUTPUT_BYTES,
      },
    },
  };
}
