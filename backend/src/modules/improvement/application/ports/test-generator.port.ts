import type { TestFailure } from '#improvement/domain/value-objects/verification-report.vo';
import type { FilePath } from '#kernel/primitives/file-path';
import type { Instant } from '#kernel/time/instant';

interface LineRange {
  readonly start: number;
  readonly end: number;
}

/** A change of the target no test notices, as a place to aim a test at. */
export interface MutantHint {
  readonly line: number;
  readonly mutator: string;
  readonly replacement: string;
}

/** The file to raise the coverage of, and what of it no test reaches. */
export interface GenerationTarget {
  readonly file: FilePath;
  readonly uncoveredLines: readonly LineRange[];
  readonly openBranchLines: readonly number[];
  readonly uncoveredFunctions: readonly {
    readonly name: string;
    readonly line: number;
  }[];
  readonly undetectedMutants: readonly MutantHint[];
}

/** Why the gate rejected the attempt before this one. */
export interface RejectionFeedback {
  readonly reasons: readonly string[];
  /** The mutants the rejected tests still did not detect. */
  readonly survivingMutants: readonly (MutantHint & {
    /** Whether a rejected test ran the code of the mutant at all. */
    readonly reached: boolean;
  })[];
  /**
   * What the first run of tests that failed said first, in the words of
   * the runner, or `null`. Text of the repository: data, never a rule.
   */
  readonly testFailure: TestFailure | null;
}

/**
 * The three limits of one call. The cost is an estimate of the CLI and
 * one answer can pass it, so the time limit is enforced from outside.
 */
export interface GenerationLimits {
  readonly maxTurns: number;
  /** `null` under a subscription, where a price of a call means nothing. */
  readonly maxCostUsd: number | null;
  readonly timeoutMs: number;
}

export interface GenerationRequest {
  /**
   * The root of a working copy the caller owns and lends for one call.
   * The generator writes its test into it and keeps no reference.
   */
  readonly workingCopyPath: string;
  /** Whose output the raw text is, such as `improvement:<id>:attempt:2`. */
  readonly owner: string;
  readonly target: GenerationTarget;
  /** How the name of a file the generator may add ends, as `.test.ts`. */
  readonly testFileSuffixes: readonly string[];
  readonly testRunner: 'jest' | 'vitest';
  /** `null` for the first attempt. */
  readonly feedback: RejectionFeedback | null;
  readonly generator: {
    readonly cli: 'claude_code';
    readonly model: string;
    readonly promptVersion: string;
  };
  readonly limits: GenerationLimits;
}

/** One window of usage of a subscription, as the CLI reports it. */
interface UsageWindow {
  /** The share that is used, from 0 to 1. */
  readonly utilization: number;
  readonly resetsAt: Instant;
}

/** A window the CLI did not name is `null`. */
export interface SubscriptionWindows {
  readonly fiveHour: UsageWindow | null;
  readonly sevenDay: UsageWindow | null;
}

/** What every outcome reports, also one that produced no test. */
export interface GenerationReport {
  /** Input and output tokens together. 0 when the CLI reported none. */
  readonly tokensUsed: number;
  /** Who pays, as the CLI itself said when it started. */
  readonly billing: 'subscription' | 'api_key';
  /** `null` with a key, and when the CLI named no window in this call. */
  readonly windows: SubscriptionWindows | null;
  /**
   * The tool calls the CLI refused. They are a sign that something in the
   * repository tried to steer the model.
   */
  readonly refusedToolCalls: readonly string[];
  /** The raw output of the CLI in the artifact store. */
  readonly outputReference: string | null;
}

/**
 * `generated`: the CLI finished and the working copy changed. `no_changes`:
 * it finished and changed nothing. `limit_reached`: the call hit its limit
 * of turns, cost or time. `window_exhausted`: the short window of a
 * subscription is spent and opens again at `resumesAt`. `quota_exhausted`:
 * the account has no usage left and waiting a few hours does not help.
 * `credential_exposed`: a changed file holds the credential.
 *
 * After every outcome but `generated` the caller throws the working copy
 * away: a call that stopped at a limit may have written a file already.
 */
export type GenerationResult =
  | (GenerationReport & {
      readonly outcome:
        | 'generated'
        | 'no_changes'
        | 'limit_reached'
        | 'quota_exhausted'
        | 'credential_exposed';
    })
  | (GenerationReport & {
      readonly outcome: 'window_exhausted';
      /** `null` when the CLI did not say when the window opens. */
      readonly resumesAt: Instant | null;
    });

/**
 * The AI CLI that writes the test. It runs in the generator sandbox with
 * the credential of the language model and nothing else of the service,
 * and with every configuration of the repository switched off. A missing
 * CLI, a failed login or a CLI that starts with other tools than the
 * allowed ones is a fault: a typed error with a `code` and a `retryable`
 * flag. An aborted signal stops the call and throws.
 */
export interface TestGenerator {
  generate(
    request: GenerationRequest,
    signal: AbortSignal,
  ): Promise<GenerationResult>;
}

/** The injection token of the test generator. */
export const TEST_GENERATOR = Symbol('TestGenerator');
