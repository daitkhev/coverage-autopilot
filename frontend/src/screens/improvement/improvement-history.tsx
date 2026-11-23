import { Box } from 'ink';
import type { ReactNode } from 'react';

import type { Attempt } from '@coverage-autopilot/api-contracts/attempts';
import type { CoverageCounter } from '@coverage-autopilot/api-contracts/coverage';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { ProgressStep } from '@coverage-autopilot/api-contracts/progress';
import type { ImprovementStatus } from '@coverage-autopilot/api-contracts/statuses';

import { Clipped } from '#components/clipped';
import { type GateCheck, GateChecks } from '#components/gate-checks';
import { Panel } from '#components/panel';
import { ProgressMeter } from '#components/progress-meter';
import { RoleText } from '#components/role-text';
import { Timeline, type TimelineStep } from '#components/timeline';
import {
  type AttemptResult,
  resultsOf,
} from '#screens/improvement/attempt-words';
import { baselineOf } from '#screens/improvement/improvement-answer';
import { LastLine } from '#screens/improvement/last-line';
import { analysisLook } from '#screens/improvement/step-line';
import { countWords, percentWords } from '#theme/counts';
import { durationWords, elapsedMs } from '#theme/moments';
import { attemptLook, CHECK_STATUS, IMPROVEMENT_STATUS } from '#theme/status';
import { BAR_CELLS, GAP } from '#theme/widths';

/** Beside a running attempt: what it does in the status of the work. */
const OPEN_NOTES: ReadonlyMap<ImprovementStatus, string> = new Map([
  ['generating', 'writing a test'],
  ['verifying', 'verifying'],
  ['waiting_for_limit', 'waiting for the limit'],
]);

/** Where the reasons of a rejection went while the work goes on. */
const REASONS_WENT: AttemptResult = {
  text: 'the reasons went to the generator',
};

function counterWords(name: string, counter: CoverageCounter): string {
  return counter.percentage === null
    ? `no ${name}`
    : `${name} ${percentWords(counter.percentage)}`;
}

/** What the analysis measured, as the first report of the gate tells it. */
function measuredWords(improvement: Improvement): AttemptResult[] {
  const report = baselineOf(improvement);
  if (report?.coverageBefore === undefined || report.coverageBefore === null) {
    return [];
  }
  const { lines, branches } = report.coverageBefore;
  const undetected = report.mutants?.undetectedBefore;
  const mutants =
    undetected === undefined
      ? []
      : [`${countWords(undetected, 'mutant')} no test detects`];
  const words = [
    counterWords('lines', lines),
    counterWords('branches', branches),
    ...mutants,
  ];
  return [{ text: words.join(' · ') }];
}

/** A repeated step says which run it is at, a finished one how many ran. */
function runsOf(step: ProgressStep): { readonly time?: string } {
  if (step.done === undefined || step.total === undefined) {
    return {};
  }
  const total = String(step.total);
  return step.status === 'running'
    ? { time: `run ${String(Math.min(step.done + 1, step.total))} of ${total}` }
    : { time: `${String(step.done)} of ${total} runs` };
}

function checkOf(step: ProgressStep): GateCheck {
  return { name: step.code, status: step.status, ...runsOf(step) };
}

/** The steps the worker reports, with how many of them are behind it. */
function Steps({
  title,
  steps,
}: {
  readonly title: string;
  readonly steps: readonly ProgressStep[];
}): ReactNode {
  const ended = steps.filter(
    (step) => step.status !== 'pending' && step.status !== 'running',
  );
  return (
    <Box flexDirection="column">
      <Box gap={GAP}>
        <RoleText>{title}</RoleText>
        <ProgressMeter
          kind="steps"
          used={ended.length}
          total={steps.length}
          cells={BAR_CELLS.detail}
        />
      </Box>
      <GateChecks checks={steps.map(checkOf)} />
    </Box>
  );
}

/** The steps the worker reports in one status, under the name they go by. */
interface Phase {
  readonly status: ImprovementStatus;
  readonly title: string;
}

const ANALYSIS: Phase = { status: 'analyzing', title: 'Steps' };
const VERIFICATION: Phase = { status: 'verifying', title: 'Checks' };

/** The steps of the work in this phase, when the worker reports any. */
function stepsIn(
  improvement: Improvement,
  phase: Phase,
): { readonly details?: ReactNode } {
  const steps = improvement.progress?.steps ?? [];
  return improvement.status !== phase.status || steps.length === 0
    ? {}
    : { details: <Steps title={phase.title} steps={steps} /> };
}

function analysisStep(improvement: Improvement, now: string): TimelineStep {
  const started = improvement.phaseStartedAt;
  const running = improvement.status === 'analyzing' && started !== null;
  return {
    id: 'analysis',
    look: analysisLook(improvement),
    title: 'Analyzing',
    done: improvement.attempts.length > 0,
    results: measuredWords(improvement),
    ...(running ? { time: durationWords(elapsedMs(started, now)) } : {}),
    ...stepsIn(improvement, ANALYSIS),
  };
}

function attemptStep(
  improvement: Improvement,
  attempt: Attempt,
  now: string,
): TimelineStep {
  const look = attemptLook(attempt);
  const open = attempt.status === 'open';
  const note = open ? OPEN_NOTES.get(improvement.status) : look.word;
  const rejected = attempt.report?.verdict === 'rejected';
  const taken = elapsedMs(attempt.startedAt, attempt.finishedAt ?? now);
  return {
    id: `attempt-${String(attempt.number)}`,
    look,
    title: `Attempt ${String(attempt.number)}`,
    done: !open,
    time: durationWords(taken),
    results: [...resultsOf(attempt), ...(rejected ? [REASONS_WENT] : [])],
    ...(note === undefined ? {} : { note }),
    ...(open ? stepsIn(improvement, VERIFICATION) : {}),
  };
}

/** The last step: the approval in review mode, then the pull request. */
function publishStep(improvement: Improvement): TimelineStep {
  const step = { id: 'publish', title: 'Publishing', done: false };
  switch (improvement.status) {
    case 'awaiting_approval':
      return {
        ...step,
        look: IMPROVEMENT_STATUS.awaiting_approval,
        title: 'Approval',
        note: 'press p to read the patch and decide',
      };
    case 'publishing':
      return {
        ...step,
        look: CHECK_STATUS.running,
        note: 'opening the pull request',
      };
    default:
      return {
        ...step,
        look: CHECK_STATUS.pending,
        note:
          improvement.mode === 'review'
            ? 'waits for your approval'
            : 'opens the pull request without asking',
      };
  }
}

/** The history of the work, oldest first, each step with its result. */
function historyOf(improvement: Improvement, now: string): TimelineStep[] {
  return [
    analysisStep(improvement, now),
    ...improvement.attempts.map((attempt) =>
      attemptStep(improvement, attempt, now),
    ),
    publishStep(improvement),
  ];
}

interface HistoryProps {
  readonly improvement: Improvement;
  readonly now: string;
  readonly timeZone: string;
  readonly focused: boolean;
}

/**
 * The work while it runs: every step so far with its result, the checks
 * of the running attempt, and what the service does now. A long history
 * is cut at the bottom of the panel, so the last line always shows.
 */
export function History({
  improvement,
  now,
  timeZone,
  focused,
}: HistoryProps): ReactNode {
  return (
    <Panel title="Improvement" note={improvement.id} focused={focused}>
      <Clipped>
        <Timeline steps={historyOf(improvement, now)} variant="history" />
      </Clipped>
      <Box marginTop={1}>
        <LastLine improvement={improvement} now={now} timeZone={timeZone} />
      </Box>
    </Panel>
  );
}
