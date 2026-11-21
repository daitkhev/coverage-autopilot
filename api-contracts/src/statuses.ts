import { z } from 'zod';

/** A scan is a job to the service, but the client never sees a job. */
export const scanStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export type ScanStatus = z.infer<typeof scanStatusSchema>;

export const improvementStatusSchema = z.enum([
  'created',
  'analyzing',
  'generating',
  'verifying',
  'awaiting_approval',
  'publishing',
  'completed',
  'failed',
  'cancelled',
  'skipped',
]);

export type ImprovementStatus = z.infer<typeof improvementStatusSchema>;

export const attemptStatusSchema = z.enum(['open', 'closed']);

export type AttemptStatus = z.infer<typeof attemptStatusSchema>;

export const verdictSchema = z.enum(['accepted', 'rejected', 'inconclusive']);

export type Verdict = z.infer<typeof verdictSchema>;

export const checkStatusSchema = z.enum([
  'passed',
  'failed',
  'skipped',
  'not_applicable',
  'error',
]);

export type CheckStatus = z.infer<typeof checkStatusSchema>;

/** The seven checks of the quality gate, in the order they run. */
export const checkNameSchema = z.enum([
  'test_files_only',
  'type_check',
  'new_tests_pass',
  'existing_tests_pass',
  'repeated_runs',
  'coverage_increase',
  'mutation_gain',
]);

export type CheckName = z.infer<typeof checkNameSchema>;

/** A step of running work ends the way a check does. */
export const stepStatusSchema = z.enum([
  'pending',
  'running',
  ...checkStatusSchema.options,
]);

export type StepStatus = z.infer<typeof stepStatusSchema>;

export const generationOutcomeSchema = z.enum([
  'generated',
  'no_changes',
  'limit_reached',
  'quota_exhausted',
  'credential_exposed',
]);

export type GenerationOutcome = z.infer<typeof generationOutcomeSchema>;

export const fileStateSchema = z.enum([
  'measured',
  'no_executable_code',
  'unmeasured',
]);

export type FileState = z.infer<typeof fileStateSchema>;

export const unmeasuredReasonSchema = z.enum([
  'parse_failed',
  'missing_from_report',
  'no_counters',
]);

export type UnmeasuredReason = z.infer<typeof unmeasuredReasonSchema>;

export const coverageMetricSchema = z.enum([
  'statements',
  'branches',
  'functions',
  'lines',
]);

export type CoverageMetric = z.infer<typeof coverageMetricSchema>;

export const improvementFailureReasonSchema = z.enum([
  'budget_exhausted',
  'stale_snapshot',
  'verification_error',
  'retries_exhausted',
  'mutation_unsupported',
  'quota_exhausted',
  'credential_exposed',
]);

export type ImprovementFailureReason = z.infer<
  typeof improvementFailureReasonSchema
>;

export const skipReasonSchema = z.enum([
  'threshold_met',
  'no_undetected_mutants',
]);

export type SkipReason = z.infer<typeof skipReasonSchema>;

export const scanFailureReasonSchema = z.enum([
  'unsupported_project',
  'install_failed',
  'retries_exhausted',
]);

export type ScanFailureReason = z.infer<typeof scanFailureReasonSchema>;

/** Review mode stops before publishing and waits for a person. */
export const improvementModeSchema = z.enum(['automatic', 'review']);

export type ImprovementMode = z.infer<typeof improvementModeSchema>;

/** The groups of the improvements screen: who has to act next. */
export const waitingForSchema = z.enum(['approval', 'worker', 'repository']);

export type WaitingFor = z.infer<typeof waitingForSchema>;

export const accessCheckNameSchema = z.enum([
  'git_present',
  'gh_authenticated',
  'push_allowed',
]);

export type AccessCheckName = z.infer<typeof accessCheckNameSchema>;

/** A failed step stops the rest, so a later step may never run. */
export const accessCheckStatusSchema = z.enum(['passed', 'failed', 'not_run']);

export type AccessCheckStatus = z.infer<typeof accessCheckStatusSchema>;
