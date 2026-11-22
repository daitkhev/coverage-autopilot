import type { CoverageModule } from '#coverage/coverage.module';
import type { ImprovementModule } from '#improvement/improvement.module';
import type { ServiceConfig } from '#infrastructure/config/service-config';
import type { VerificationModule } from '#verification/verification.module';

/** The settings of each module, as its module file takes them. */
type CoverageValues = Parameters<typeof CoverageModule.register>[0];
type VerificationValues = Parameters<typeof VerificationModule.register>[0];
type ImprovementValues = Parameters<typeof ImprovementModule.register>[0];

/** The `PATH` the Debian images of Node set, the default image among them. */
const IMAGE_PATH =
  '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

/**
 * Exactly the variables a command of a repository gets in the sandbox. Its
 * user has no home in the image, and npm writes its cache under the home,
 * so the home is the scratch folder. `CI` keeps a test runner from
 * watching the files or asking a question.
 */
const COMMAND_ENVIRONMENT = { PATH: IMAGE_PATH, HOME: '/tmp', CI: 'true' };

/**
 * StrykerJS as the design measured it, with its own defaults of the time
 * of one mutant: the time of its tests times 1.5, plus 5 seconds.
 */
const MUTATION_TOOL_VERSION = '10.1.1';
const MUTANT_TIMEOUT_FACTOR = 1.5;
const MUTANT_TIMEOUT_MS = 5_000;

/** Enough to point the next attempt at the gaps without filling its turns. */
const SURVIVING_MUTANT_LIMIT = 10;

/** The checks run three times in a row, as `run 2 of 3` in the design. */
const REPEATED_RUNS = 3;

/**
 * The kill rate of the new tests a patch needs. The design has not
 * calibrated it yet, so it is the middle of the scale until it is.
 */
const MUTATION_THRESHOLD = 50;

/** The one prompt of the generator so far. */
const PROMPT_VERSION = '1';

/** The tools of the protected start of the CLI, as `--tools` names them. */
const GENERATOR_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep'];

/** A patch adds test files only, named as the decision log says. */
const TEST_FILE_SUFFIXES = ['.test.ts', '.test.tsx'];

/**
 * How much of what a run wrote is searched for the credential. A patch
 * adds a few test files, so a run that wrote more is noted, not read.
 */
const CREDENTIAL_SCAN = { maxFiles: 100, maxFileBytes: 1_048_576 };

function coverageOf(config: ServiceConfig): CoverageValues {
  return {
    installTimeoutMs: config.commands.installTimeoutMs,
    testRunTimeoutMs: config.commands.testRunTimeoutMs,
    commandEnvironment: COMMAND_ENVIRONMENT,
  };
}

function verificationOf(config: ServiceConfig): VerificationValues {
  const { commands } = config;
  return {
    gate: {
      typeCheckTimeoutMs: commands.typeCheckTimeoutMs,
      mutationRunTimeoutMs: commands.mutationRunTimeoutMs,
      survivingMutantLimit: SURVIVING_MUTANT_LIMIT,
      commandEnvironment: COMMAND_ENVIRONMENT,
    },
    mutation: {
      toolVersion: MUTATION_TOOL_VERSION,
      concurrency: commands.mutationConcurrency,
      mutantTimeoutFactor: MUTANT_TIMEOUT_FACTOR,
      mutantTimeoutMs: MUTANT_TIMEOUT_MS,
      installTimeoutMs: commands.installTimeoutMs,
      commandEnvironment: COMMAND_ENVIRONMENT,
    },
  };
}

/**
 * A request that names nothing is automatic, judged by every check of the
 * gate, and written by the generator of the configuration.
 */
function improvementOf(config: ServiceConfig): ImprovementValues {
  const { generator } = config;
  return {
    budget: config.budget,
    mode: 'automatic',
    policy: {
      requiredChecks: [
        'test_files_only',
        'type_check',
        'new_tests_pass',
        'existing_tests_pass',
        'repeated_runs',
        'coverage_increase',
        'mutation_gain',
      ],
      repeatedRuns: REPEATED_RUNS,
      mutationThreshold: MUTATION_THRESHOLD,
    },
    generator: {
      cli: generator.cli,
      model: generator.model,
      promptVersion: PROMPT_VERSION,
      billing: generator.billing,
    },
    generation: generator.call,
    testFileSuffixes: TEST_FILE_SUFFIXES,
    limitWaitMs: generator.limitWaitMs,
    adapter: {
      command: ['claude'],
      allowedTools: GENERATOR_TOOLS,
      credential: generator.credential,
      environment: { PATH: IMAGE_PATH },
      scan: CREDENTIAL_SCAN,
    },
    sandbox: generator.sandbox,
  };
}

/** What the root module gives the modules of coverage, the gate and work. */
export interface ModuleSettings {
  readonly coverage: CoverageValues;
  readonly verification: VerificationValues;
  readonly improvement: ImprovementValues;
}

/**
 * The settings of the three modules that run the commands of a repository
 * and the generator. What the configuration does not hold is fixed here.
 */
export function moduleSettingsOf(config: ServiceConfig): ModuleSettings {
  return {
    coverage: coverageOf(config),
    verification: verificationOf(config),
    improvement: improvementOf(config),
  };
}
