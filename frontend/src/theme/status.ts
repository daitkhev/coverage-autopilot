import type { Role } from '#theme/roles';
import type { GlyphName } from '#theme/symbols';

/** A status is a symbol and a word in the colour of its role. */
export interface StatusLook {
  readonly glyph: GlyphName;
  readonly word: string;
  readonly role: Role;
}

export type ImprovementStatus =
  | 'created'
  | 'analyzing'
  | 'generating'
  | 'verifying'
  | 'publishing'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export const IMPROVEMENT_STATUS: Readonly<
  Record<ImprovementStatus, StatusLook>
> = {
  created: { glyph: 'notStarted', word: 'WAIT', role: 'secondary' },
  analyzing: { glyph: 'spinner', word: 'RUN', role: 'running' },
  generating: { glyph: 'spinner', word: 'RUN', role: 'running' },
  verifying: { glyph: 'spinner', word: 'RUN', role: 'running' },
  publishing: { glyph: 'spinner', word: 'RUN', role: 'running' },
  awaiting_approval: { glyph: 'waiting', word: 'REVIEW', role: 'accent' },
  completed: { glyph: 'passed', word: 'DONE', role: 'success' },
  failed: { glyph: 'failed', word: 'FAIL', role: 'danger' },
  cancelled: { glyph: 'cancelled', word: 'CANCEL', role: 'secondary' },
  skipped: { glyph: 'skipped', word: 'SKIP', role: 'secondary' },
};

/** A rejected attempt is routine, so it is yellow and not red. */
export type AttemptVerdict = 'accepted' | 'rejected' | 'inconclusive';

export const ATTEMPT_VERDICT: Readonly<Record<AttemptVerdict, StatusLook>> = {
  accepted: { glyph: 'passed', word: 'accepted', role: 'success' },
  rejected: { glyph: 'failed', word: 'rejected', role: 'warning' },
  inconclusive: { glyph: 'attention', word: 'runs again', role: 'warning' },
};

export type CheckStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'error'
  | 'skipped'
  | 'not_applicable';

export const CHECK_STATUS: Readonly<Record<CheckStatus, StatusLook>> = {
  pending: { glyph: 'notStarted', word: 'not started', role: 'secondary' },
  running: { glyph: 'spinner', word: 'running', role: 'running' },
  passed: { glyph: 'passed', word: 'passed', role: 'success' },
  failed: { glyph: 'failed', word: 'failed', role: 'warning' },
  error: { glyph: 'attention', word: 'runs again', role: 'warning' },
  skipped: { glyph: 'skipped', word: 'off', role: 'secondary' },
  not_applicable: { glyph: 'skipped', word: 'n/a', role: 'secondary' },
};

export type FileState = 'measured' | 'no_executable_code' | 'unmeasured';

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

export type UnmeasuredReason =
  'parse_failed' | 'missing_from_report' | 'no_counters';

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

export type ServiceState = 'up' | 'starting' | 'unreachable';

export const SERVICE_STATE: Readonly<Record<ServiceState, StatusLook>> = {
  up: { glyph: 'on', word: 'service up', role: 'success' },
  starting: { glyph: 'spinner', word: 'starting the service', role: 'running' },
  unreachable: { glyph: 'failed', word: 'service down', role: 'danger' },
};
