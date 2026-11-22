import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type {
  AccessCheckName,
  AccessCheckStatus,
  FileState,
  ImprovementStatus,
  ScanStatus,
  StepStatus,
  UnmeasuredReason,
  Verdict,
  WaitingFor,
} from '@coverage-autopilot/api-contracts/statuses';

import { clockWords } from '#theme/moments';
import type { Role } from '#theme/roles';
import type { GlyphName } from '#theme/symbols';

/** A status is a symbol and a word in the colour of its role. */
export interface StatusLook {
  readonly glyph: GlyphName;
  readonly word: string;
  readonly role: Role;
}

/**
 * The keys of every table but the last are the statuses of the contract,
 * so a status the service adds or drops stops the build here.
 */
export const IMPROVEMENT_STATUS: Readonly<
  Record<ImprovementStatus, StatusLook>
> = {
  created: { glyph: 'notStarted', word: 'WAIT', role: 'secondary' },
  analyzing: { glyph: 'spinner', word: 'RUN', role: 'running' },
  generating: { glyph: 'spinner', word: 'RUN', role: 'running' },
  waiting_for_limit: { glyph: 'notStarted', word: 'WAIT', role: 'secondary' },
  verifying: { glyph: 'spinner', word: 'RUN', role: 'running' },
  publishing: { glyph: 'spinner', word: 'RUN', role: 'running' },
  awaiting_approval: { glyph: 'waiting', word: 'REVIEW', role: 'accent' },
  completed: { glyph: 'passed', word: 'DONE', role: 'success' },
  failed: { glyph: 'failed', word: 'FAIL', role: 'danger' },
  cancelled: { glyph: 'cancelled', word: 'CANCEL', role: 'secondary' },
  skipped: { glyph: 'skipped', word: 'SKIP', role: 'secondary' },
};

/** A scan is said in the words of an improvement, so one list reads both. */
export const SCAN_STATUS: Readonly<Record<ScanStatus, StatusLook>> = {
  queued: { glyph: 'notStarted', word: 'WAIT', role: 'secondary' },
  running: { glyph: 'spinner', word: 'RUN', role: 'running' },
  completed: { glyph: 'passed', word: 'DONE', role: 'success' },
  failed: { glyph: 'failed', word: 'FAIL', role: 'danger' },
  cancelled: { glyph: 'cancelled', word: 'CANCEL', role: 'secondary' },
};

/** Who or what an improvement waits for, after "waits for". */
export const WAITING_FOR: Readonly<Record<WaitingFor, string>> = {
  approval: 'your approval',
  worker: 'a free worker',
  repository: 'its repository',
  limit: 'the limit',
};

/**
 * What an improvement waits for, after "waits": `for a free worker`, or
 * `for the limit until 16:00`. One that waits for no one
 * waits for its turn, unless its status says it waits for the limit.
 */
export function waitWords(
  improvement: Pick<Improvement, 'status' | 'waitingFor' | 'resumesAt'>,
  timeZone: string,
): string {
  const { status, waitingFor, resumesAt } = improvement;
  const waited =
    waitingFor ?? (status === 'waiting_for_limit' ? 'limit' : undefined);
  const what = waited === undefined ? 'its turn' : WAITING_FOR[waited];
  const until =
    resumesAt === null ? '' : ` until ${clockWords(resumesAt, timeZone)}`;
  return `for ${what}${until}`;
}

/** A refused step of the access check stops the work, so it is red. */
export const ACCESS_CHECK_STATUS: Readonly<
  Record<AccessCheckStatus, StatusLook>
> = {
  passed: { glyph: 'passed', word: 'passed', role: 'success' },
  failed: { glyph: 'failed', word: 'failed', role: 'danger' },
  not_run: { glyph: 'skipped', word: 'not checked', role: 'secondary' },
};

/** What each step of the access check proves, in plain words. */
export const ACCESS_STEP_WORDS: Readonly<Record<AccessCheckName, string>> = {
  git_present: 'git installed',
  gh_authenticated: 'gh signed in',
  push_allowed: 'push access',
};

/** A rejected attempt is routine, so it is yellow and not red. */
export const ATTEMPT_VERDICT: Readonly<Record<Verdict, StatusLook>> = {
  accepted: { glyph: 'passed', word: 'accepted', role: 'success' },
  rejected: { glyph: 'failed', word: 'rejected', role: 'warning' },
  inconclusive: { glyph: 'attention', word: 'runs again', role: 'warning' },
};

/** A check is drawn while it waits and runs too, so it is a step. */
export const CHECK_STATUS: Readonly<Record<StepStatus, StatusLook>> = {
  pending: { glyph: 'notStarted', word: 'not started', role: 'secondary' },
  running: { glyph: 'spinner', word: 'running', role: 'running' },
  passed: { glyph: 'passed', word: 'passed', role: 'success' },
  failed: { glyph: 'failed', word: 'failed', role: 'warning' },
  error: { glyph: 'attention', word: 'runs again', role: 'warning' },
  skipped: { glyph: 'skipped', word: 'off', role: 'secondary' },
  not_applicable: { glyph: 'skipped', word: 'n/a', role: 'secondary' },
};

/** A file without numbers has a figure in place of a percentage. */
export interface FileLook extends StatusLook {
  readonly figure?: string;
}

export const FILE_STATE: Readonly<Record<FileState, FileLook>> = {
  measured: { glyph: 'on', word: 'measured', role: 'primary' },
  no_executable_code: {
    glyph: 'skipped',
    word: 'no code',
    role: 'secondary',
    figure: '0/0',
  },
  unmeasured: {
    glyph: 'attention',
    word: 'not measured',
    role: 'warning',
    figure: 'N/A',
  },
};

/** Why a file has no numbers, in plain words, and the next step. */
export interface ReasonWords {
  readonly said: string;
  readonly next: string;
}

export const UNMEASURED_REASON: Readonly<
  Record<UnmeasuredReason, ReasonWords>
> = {
  parse_failed: {
    said: 'has a syntax error',
    next: 'Fix the file, then scan again.',
  },
  missing_from_report: {
    said: 'is missing from the report',
    next: 'Check the file list of the test runner, then scan again.',
  },
  no_counters: {
    said: 'was reported without numbers',
    next: 'Scan again. If it repeats, open the output of the run.',
  },
};

/** What the client sees of the service. The contract has no such list. */
export type ServiceState = 'up' | 'starting' | 'unreachable';

export const SERVICE_STATE: Readonly<Record<ServiceState, StatusLook>> = {
  up: { glyph: 'on', word: 'service up', role: 'success' },
  starting: { glyph: 'spinner', word: 'starting the service', role: 'running' },
  unreachable: { glyph: 'failed', word: 'service down', role: 'danger' },
};
