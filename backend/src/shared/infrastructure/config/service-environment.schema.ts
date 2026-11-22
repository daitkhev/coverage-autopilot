import { isAbsolute } from 'node:path';

import { z } from 'zod';

import {
  instanceDirectoryOf,
  SOCKET_PATH_BYTES,
  socketPathBytes,
} from '#infrastructure/config/instance-paths';
import { LOG_LEVELS } from '#infrastructure/logging/log-settings';

/** A variable of the service: what it expects, and its value when unset. */
export interface Variable {
  readonly expected: string;
  readonly fallback?: string;
}

const WHOLE = 'a whole number above 0';
const IMAGE_NAME =
  'the name of an image, with no space and no "-" at its start';

/** Every variable the service reads, besides those it passes on as they are. */
export const VARIABLES = {
  HOME: { expected: 'the home folder of the user' },
  AUTOPILOT_INSTANCE_DIR: {
    expected:
      'an absolute path of a folder, or, when it is not set, an absolute ' +
      'HOME to put the default under',
  },
  AUTOPILOT_LOG_LEVEL: {
    expected: 'debug, info, warn or error',
    fallback: 'info',
  },
  AUTOPILOT_SANDBOX_ENGINE: {
    expected:
      'a JSON list of the program and its arguments, such as ["docker"]',
    fallback: '["docker"]',
  },
  AUTOPILOT_SANDBOX_IMAGE: {
    expected: IMAGE_NAME,
    // The Node the project itself uses, with the programs the tools of a
    // repository start that its slim image leaves out, such as ps. The tag
    // names the version of Node.
    fallback: 'coverage-autopilot-sandbox:26',
  },
  AUTOPILOT_SANDBOX_UID: {
    expected:
      'a whole number above 0, so that no command runs as root. When it ' +
      'is not set, it is the user the service runs as',
  },
  AUTOPILOT_SANDBOX_GID: {
    expected:
      'a whole number above 0, so that no command runs in the group of ' +
      'root. When it is not set, it is the group the service runs in',
  },
  AUTOPILOT_SANDBOX_MEMORY_MB: { expected: WHOLE, fallback: '4096' },
  AUTOPILOT_SANDBOX_CPUS: { expected: 'a number above 0', fallback: '2' },
  AUTOPILOT_SANDBOX_PROCESSES: { expected: WHOLE, fallback: '512' },
  AUTOPILOT_SANDBOX_SCRATCH_MB: { expected: WHOLE, fallback: '512' },
  AUTOPILOT_SANDBOX_OUTPUT_BYTES: { expected: WHOLE, fallback: '1048576' },
  AUTOPILOT_QUEUE_LEASE_MS: { expected: WHOLE, fallback: '60000' },
  AUTOPILOT_QUEUE_HEARTBEAT_MS: { expected: WHOLE, fallback: '20000' },
  AUTOPILOT_QUEUE_MAX_RUNS: { expected: WHOLE, fallback: '3' },
  AUTOPILOT_QUEUE_POLL_MS: { expected: WHOLE, fallback: '1000' },
  AUTOPILOT_QUEUE_CONCURRENCY: { expected: WHOLE, fallback: '2' },
  // The install is the one command with the network, and a large lockfile
  // of a slow registry takes minutes.
  AUTOPILOT_INSTALL_TIMEOUT_MS: { expected: WHOLE, fallback: '600000' },
  AUTOPILOT_TEST_RUN_TIMEOUT_MS: { expected: WHOLE, fallback: '900000' },
  AUTOPILOT_TYPE_CHECK_TIMEOUT_MS: { expected: WHOLE, fallback: '300000' },
  // The tool limits one mutant and never a whole run, so this is the limit
  // of the run. It is the default minutes of a budget, which wins anyway.
  AUTOPILOT_MUTATION_RUN_TIMEOUT_MS: { expected: WHOLE, fallback: '1800000' },
  // The memory of a run grows with each runner, and a sandbox has two
  // processors by default.
  AUTOPILOT_MUTATION_CONCURRENCY: { expected: WHOLE, fallback: '2' },
  // A clone of a large history takes minutes, a call of the host seconds.
  AUTOPILOT_GIT_TIMEOUT_MS: { expected: WHOLE, fallback: '600000' },
  AUTOPILOT_GH_TIMEOUT_MS: { expected: WHOLE, fallback: '60000' },
  AUTOPILOT_GENERATOR: { expected: 'claude_code', fallback: 'claude_code' },
  AUTOPILOT_GENERATOR_BILLING: {
    expected: 'subscription or api_key',
    fallback: 'subscription',
  },
  AUTOPILOT_GENERATOR_MODEL: {
    expected:
      'the name of a model the CLI takes, such as sonnet, with no space ' +
      'and no "-" at its start',
    // A name the CLI resolves to its current model of that family, so the
    // default never names a model that was withdrawn.
    fallback: 'sonnet',
  },
  AUTOPILOT_GENERATOR_IMAGE: {
    expected: IMAGE_NAME,
    // An image with the CLI installed, at the version the design was
    // measured with. A name with no "/" is an official one on the default
    // registry, where no one else can publish an image under it.
    fallback: 'coverage-autopilot-generator:2.1.329',
  },
  // A run streams every event it has, and its report of the start comes
  // first: a limit that cut the head of the output would lose it.
  AUTOPILOT_GENERATOR_OUTPUT_BYTES: { expected: WHOLE, fallback: '16777216' },
  // Reading the target, its imports and a test beside it, then writing and
  // fixing one file.
  AUTOPILOT_GENERATOR_MAX_TURNS: { expected: WHOLE, fallback: '20' },
  AUTOPILOT_GENERATOR_MAX_COST_USD: { expected: 'a number above 0' },
  AUTOPILOT_GENERATOR_TIMEOUT_MS: { expected: WHOLE, fallback: '600000' },
  // The wait for the window of a subscription when the CLI did not say when
  // it opens. An improvement waits twice at most.
  AUTOPILOT_GENERATOR_LIMIT_WAIT_MS: { expected: WHOLE, fallback: '3600000' },
  AUTOPILOT_BUDGET_ATTEMPTS: { expected: WHOLE, fallback: '3' },
  AUTOPILOT_BUDGET_MAX_ATTEMPTS: { expected: WHOLE, fallback: '10' },
  AUTOPILOT_BUDGET_MINUTES: { expected: WHOLE, fallback: '30' },
  AUTOPILOT_BUDGET_MAX_MINUTES: { expected: WHOLE, fallback: '120' },
  AUTOPILOT_BUDGET_TOKENS: { expected: WHOLE },
  AUTOPILOT_BUDGET_MAX_TOKENS: { expected: WHOLE },
  AUTOPILOT_GIT_AUTHOR_NAME: {
    expected: 'a name on one line, with no "<" or ">"',
    fallback: 'Coverage Autopilot',
  },
  AUTOPILOT_GIT_AUTHOR_EMAIL: {
    expected: 'an address such as tests@example.com, with no space, "<" or ">"',
    // The domain is reserved and reaches no one, so no account of a host
    // of the code is credited with a commit it did not make.
    fallback: 'autopilot@coverage-autopilot.invalid',
  },
} as const satisfies Record<string, Variable>;

/** The limits of tokens with a key, when no variable sets them. */
export const TOKENS_WITH_A_KEY = {
  AUTOPILOT_BUDGET_TOKENS: 1_000_000,
  AUTOPILOT_BUDGET_MAX_TOKENS: 5_000_000,
} as const;

/**
 * The estimated price one call of the generator may reach with a key, when
 * no variable sets it. The limit of turns ends most calls well below it.
 */
export const COST_WITH_A_KEY_USD = 1;

/** A wrong variable and what it expects, never its value. */
export interface Problem {
  readonly variable: string;
  readonly expected: string;
}

const WHOLE_NUMBER = /^[1-9][0-9]*$/;
const POSITIVE_NUMBER = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
/** A program would read a name that starts with `-` as an option. */
const NAME = /^[^\s-]\S*$/;
/** git writes an author as `name <address>`, so neither may hold a bracket. */
const AUTHOR_NAME = /^[^\p{Cc}<>]+$/u;
const AUTHOR_EMAIL = /^[^\s<>@]+@[^\s<>@]+$/u;

function wholeNumber() {
  return z
    .string()
    .regex(WHOLE_NUMBER)
    .transform(Number)
    .pipe(z.number().max(Number.MAX_SAFE_INTEGER));
}

function positiveNumber() {
  return z
    .string()
    .regex(POSITIVE_NUMBER)
    .transform(Number)
    .pipe(z.number().positive());
}

function jsonOf(text: string, context: z.RefinementCtx): unknown {
  try {
    return JSON.parse(text);
  } catch {
    context.addIssue({
      code: 'custom',
      message: VARIABLES.AUTOPILOT_SANDBOX_ENGINE.expected,
    });
    return z.NEVER;
  }
}

const fields = z.object({
  HOME: z.string().optional(),
  AUTOPILOT_INSTANCE_DIR: z.string().optional(),
  AUTOPILOT_LOG_LEVEL: z.enum(LOG_LEVELS),
  AUTOPILOT_SANDBOX_ENGINE: z
    .string()
    .transform(jsonOf)
    .pipe(z.tuple([z.string().min(1)], z.string())),
  AUTOPILOT_SANDBOX_IMAGE: z.string().regex(NAME),
  AUTOPILOT_SANDBOX_UID: wholeNumber(),
  AUTOPILOT_SANDBOX_GID: wholeNumber(),
  AUTOPILOT_SANDBOX_MEMORY_MB: wholeNumber(),
  AUTOPILOT_SANDBOX_CPUS: positiveNumber(),
  AUTOPILOT_SANDBOX_PROCESSES: wholeNumber(),
  AUTOPILOT_SANDBOX_SCRATCH_MB: wholeNumber(),
  AUTOPILOT_SANDBOX_OUTPUT_BYTES: wholeNumber(),
  AUTOPILOT_QUEUE_LEASE_MS: wholeNumber(),
  AUTOPILOT_QUEUE_HEARTBEAT_MS: wholeNumber(),
  AUTOPILOT_QUEUE_MAX_RUNS: wholeNumber(),
  AUTOPILOT_QUEUE_POLL_MS: wholeNumber(),
  AUTOPILOT_QUEUE_CONCURRENCY: wholeNumber(),
  AUTOPILOT_INSTALL_TIMEOUT_MS: wholeNumber(),
  AUTOPILOT_TEST_RUN_TIMEOUT_MS: wholeNumber(),
  AUTOPILOT_TYPE_CHECK_TIMEOUT_MS: wholeNumber(),
  AUTOPILOT_MUTATION_RUN_TIMEOUT_MS: wholeNumber(),
  AUTOPILOT_MUTATION_CONCURRENCY: wholeNumber(),
  AUTOPILOT_GIT_TIMEOUT_MS: wholeNumber(),
  AUTOPILOT_GH_TIMEOUT_MS: wholeNumber(),
  AUTOPILOT_GENERATOR: z.enum(['claude_code']),
  AUTOPILOT_GENERATOR_BILLING: z.enum(['subscription', 'api_key']),
  AUTOPILOT_GENERATOR_MODEL: z.string().regex(NAME),
  AUTOPILOT_GENERATOR_IMAGE: z.string().regex(NAME),
  AUTOPILOT_GENERATOR_OUTPUT_BYTES: wholeNumber(),
  AUTOPILOT_GENERATOR_MAX_TURNS: wholeNumber(),
  AUTOPILOT_GENERATOR_MAX_COST_USD: positiveNumber().optional(),
  AUTOPILOT_GENERATOR_TIMEOUT_MS: wholeNumber(),
  AUTOPILOT_GENERATOR_LIMIT_WAIT_MS: wholeNumber(),
  AUTOPILOT_BUDGET_ATTEMPTS: wholeNumber(),
  AUTOPILOT_BUDGET_MAX_ATTEMPTS: wholeNumber(),
  AUTOPILOT_BUDGET_MINUTES: wholeNumber(),
  AUTOPILOT_BUDGET_MAX_MINUTES: wholeNumber(),
  AUTOPILOT_BUDGET_TOKENS: wholeNumber().optional(),
  AUTOPILOT_BUDGET_MAX_TOKENS: wholeNumber().optional(),
  AUTOPILOT_GIT_AUTHOR_NAME: z.string().regex(AUTHOR_NAME),
  AUTOPILOT_GIT_AUTHOR_EMAIL: z.string().regex(AUTHOR_EMAIL),
});

/**
 * The relations run even when a field failed, so one error lists every
 * wrong variable. A field that failed still holds its text here, so the
 * values are read as unknown, and a relation checks the fields it reads.
 */
type Values = Readonly<Record<string, unknown>>;

function numberOf(values: Values, name: string): number | null {
  const fallback: Values = TOKENS_WITH_A_KEY;
  const value = values[name] ?? fallback[name];
  return typeof value === 'number' ? value : null;
}

function textOf(values: Values, name: string): string | undefined {
  const value = values[name];
  return typeof value === 'string' ? value : undefined;
}

const AT_MOST = [
  ['AUTOPILOT_BUDGET_ATTEMPTS', 'AUTOPILOT_BUDGET_MAX_ATTEMPTS'],
  ['AUTOPILOT_BUDGET_MINUTES', 'AUTOPILOT_BUDGET_MAX_MINUTES'],
  ['AUTOPILOT_BUDGET_TOKENS', 'AUTOPILOT_BUDGET_MAX_TOKENS'],
] as const;

function budgetProblems(values: Values): Problem[] {
  return AT_MOST.flatMap(([variable, limit]) => {
    const value = numberOf(values, variable);
    const most = numberOf(values, limit);
    return value !== null && most !== null && value > most
      ? [{ variable, expected: `a whole number at most ${limit}` }]
      : [];
  });
}

const TOKENS_NEED_A_KEY =
  'no value: the windows of a subscription limit the generator, and a ' +
  'limit of tokens needs AUTOPILOT_GENERATOR_BILLING=api_key';

/** The limits a key alone may set, with what a subscription is told. */
const WITH_A_KEY_ONLY: Readonly<Record<string, string>> = {
  AUTOPILOT_BUDGET_TOKENS: TOKENS_NEED_A_KEY,
  AUTOPILOT_BUDGET_MAX_TOKENS: TOKENS_NEED_A_KEY,
  AUTOPILOT_GENERATOR_MAX_COST_USD:
    'no value: a call under a subscription has no price, and a limit of ' +
    'cost needs AUTOPILOT_GENERATOR_BILLING=api_key',
};

function subscriptionProblems(values: Values): Problem[] {
  return values['AUTOPILOT_GENERATOR_BILLING'] === 'subscription'
    ? Object.entries(WITH_A_KEY_ONLY)
        .filter(([variable]) => values[variable] !== undefined)
        .map(([variable, expected]) => ({ variable, expected }))
    : [];
}

function queueProblems(values: Values): Problem[] {
  const heartbeat = numberOf(values, 'AUTOPILOT_QUEUE_HEARTBEAT_MS');
  const lease = numberOf(values, 'AUTOPILOT_QUEUE_LEASE_MS');
  return heartbeat !== null && lease !== null && heartbeat >= lease
    ? [
        {
          variable: 'AUTOPILOT_QUEUE_HEARTBEAT_MS',
          expected:
            'a whole number below AUTOPILOT_QUEUE_LEASE_MS, so that a ' +
            'lease is renewed before it runs out',
        },
      ]
    : [];
}

function instanceProblems(values: Values): Problem[] {
  const variable = 'AUTOPILOT_INSTANCE_DIR';
  const directory = instanceDirectoryOf(
    textOf(values, variable),
    textOf(values, 'HOME'),
  );
  if (!isAbsolute(directory)) {
    return [{ variable, expected: VARIABLES[variable].expected }];
  }
  const bytes = socketPathBytes(directory);
  return bytes > SOCKET_PATH_BYTES
    ? [
        {
          variable,
          expected:
            'a folder short enough that the path of the socket in it is at ' +
            `most ${String(SOCKET_PATH_BYTES)} bytes, and it is ` +
            `${String(bytes)}. The service does not change its working ` +
            'directory to make it shorter',
        },
      ]
    : [];
}

/** The variables of the service, each checked alone, then with the others. */
export const serviceEnvironmentSchema = fields.superRefine(
  (parsed, context) => {
    const values: Values = parsed;
    const problems = [
      ...instanceProblems(values),
      ...queueProblems(values),
      ...budgetProblems(values),
      ...subscriptionProblems(values),
    ];
    for (const { variable, expected } of problems) {
      context.addIssue({ code: 'custom', path: [variable], message: expected });
    }
  },
  { when: () => true },
);

export type ServiceEnvironment = z.infer<typeof serviceEnvironmentSchema>;
