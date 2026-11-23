import type {
  GenerationReport,
  GenerationResult,
} from '#improvement/application/ports/test-generator.port';
import type { ResultEvent } from '#improvement/infrastructure/generator/claude-stream.schema';
import { shortText } from '#improvement/infrastructure/generator/credential-text';
import type {
  FinishedRun,
  RunRules,
} from '#improvement/infrastructure/generator/finished-run';
import {
  endedEarlyFault,
  failedResultFault,
  missingStartFault,
  unreadableFault,
  unsafeStartFault,
} from '#improvement/infrastructure/generator/run-faults';
import {
  type SpentLimit,
  spentLimitOf,
  windowsOf,
} from '#improvement/infrastructure/generator/usage-limit';

const SUCCESS = 'success';

/** The results of a call that stopped at its limit of turns or of cost. */
const LIMIT_SUBTYPES: ReadonlySet<string> = new Set([
  'error_max_turns',
  'error_max_budget_usd',
]);

/**
 * The error the CLI is assumed to give an answer when a key has no credit
 * left, which no wait mends. Not measured.
 */
const NO_CREDIT = 'billing_error';

/** What `apiKeySource` says when no key is used: a subscription pays. */
const NO_KEY = 'none';

/** The variable of the token of a subscription. Any other is a key. */
const SUBSCRIPTION_TOKEN = 'CLAUDE_CODE_OAUTH_TOKEN';

const MOST_REFUSED_CALLS = 20;
const MOST_REFUSED_CHARACTERS = 200;

/** The fields in which the tools of the CLI name what a call aims at. */
const TARGET_FIELDS = [
  'file_path',
  'path',
  'notebook_path',
  'pattern',
  'command',
  'url',
];

interface Verdict {
  readonly run: FinishedRun;
  readonly rules: RunRules;
  readonly report: GenerationReport;
}

/**
 * Who pays, as the start report said. A run stopped at its time limit
 * before it reported its start is judged by the variable of its
 * credential.
 */
function billingOf(
  run: FinishedRun,
  rules: RunRules,
): GenerationReport['billing'] {
  const source = run.stream.inits[0]?.apiKeySource;
  if (source === undefined) {
    return rules.credential.variable === SUBSCRIPTION_TOKEN
      ? 'subscription'
      : 'api_key';
  }
  return source === NO_KEY ? 'subscription' : 'api_key';
}

function tokensOf(result: ResultEvent | null): number {
  return result === null
    ? 0
    : result.usage.input_tokens + result.usage.output_tokens;
}

function targetOf(input: Readonly<Record<string, unknown>>): string {
  const target = TARGET_FIELDS.map((field) => input[field]).find(
    (value) => typeof value === 'string',
  );
  return typeof target === 'string' ? target : '';
}

/** A few refused calls as short texts. The raw output keeps every one. */
function refusedCallsOf(run: FinishedRun, rules: RunRules): string[] {
  const denials = run.stream.result?.permission_denials ?? [];
  return denials
    .slice(0, MOST_REFUSED_CALLS)
    .map((denial) =>
      shortText(
        `${denial.tool_name} ${targetOf(denial.tool_input)}`,
        rules.credential.value,
        MOST_REFUSED_CHARACTERS,
      ),
    );
}

function reportOf(run: FinishedRun, rules: RunRules): GenerationReport {
  const billing = billingOf(run, rules);
  return {
    tokensUsed: tokensOf(run.stream.result),
    billing,
    windows: billing === 'api_key' ? null : windowsOf(run.stream.rateLimit),
    refusedToolCalls: refusedCallsOf(run, rules),
    outputReference: run.outputReference,
  };
}

/** A spent limit of a subscription, or a key with no credit left. */
function spentOf({ run, rules }: Verdict): SpentLimit | null {
  const spent = spentLimitOf(run.stream.rateLimit, rules.now);
  if (spent !== null || !run.stream.answerErrors.has(NO_CREDIT)) {
    return spent;
  }
  return { outcome: 'quota_exhausted' };
}

/** A run that failed before its result may have stopped on a spent limit. */
function withoutResult(verdict: Verdict): GenerationResult {
  const spent = verdict.run.ended.exitCode === 0 ? null : spentOf(verdict);
  if (spent === null) {
    throw endedEarlyFault(verdict.run, verdict.rules, 'result');
  }
  return { ...verdict.report, ...spent };
}

function failed(verdict: Verdict, result: ResultEvent): GenerationResult {
  const spent = spentOf(verdict);
  if (spent === null) {
    throw failedResultFault(verdict.run, verdict.rules, result);
  }
  return { ...verdict.report, ...spent };
}

function endingOf(verdict: Verdict): GenerationResult {
  const { report, run } = verdict;
  const { result } = run.stream;
  if (result === null) {
    return withoutResult(verdict);
  }
  if (LIMIT_SUBTYPES.has(result.subtype)) {
    return { ...report, outcome: 'limit_reached' };
  }
  if (result.is_error || result.subtype !== SUCCESS) {
    return failed(verdict, result);
  }
  return { ...report, outcome: run.changed ? 'generated' : 'no_changes' };
}

/**
 * The outcome of a run, or the fault it showed. A credential in a written
 * file comes first: it decides that nothing of the run is kept. A start
 * with other tools comes next, since nothing such a run did counts. A run
 * stopped at its time limit printed no result, so it is a limit and not
 * a fault.
 */
export function outcomeOf(run: FinishedRun, rules: RunRules): GenerationResult {
  const report = reportOf(run, rules);
  if (run.exposed) {
    return { ...report, outcome: 'credential_exposed' };
  }
  const fault = unsafeStartFault(run, rules) ?? unreadableFault(run);
  if (fault !== null) {
    throw fault;
  }
  if (run.ended.outcome === 'timed_out') {
    return { ...report, outcome: 'limit_reached' };
  }
  if (run.stream.inits.length === 0) {
    throw missingStartFault(run, rules);
  }
  return endingOf({ run, rules, report });
}
