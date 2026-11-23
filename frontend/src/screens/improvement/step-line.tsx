import { Box } from 'ink';
import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { RoleText } from '#components/role-text';
import { StatusIndicator } from '#components/status-indicator';
import { Timeline, type TimelineStep } from '#components/timeline';
import {
  endOf,
  hasEnded,
  isTrying,
} from '#screens/improvement/improvement-answer';
import { durationWords, elapsedMs } from '#theme/moments';
import {
  attemptLook,
  CHECK_STATUS,
  IMPROVEMENT_STATUS,
  type StatusLook,
} from '#theme/status';
import { GAP } from '#theme/widths';

const PENDING = CHECK_STATUS.pending;
const RUNNING = CHECK_STATUS.running;
const PASSED = CHECK_STATUS.passed;

/**
 * The analysis is done once an attempt started. An improvement that ended
 * before any attempt ended in its analysis, so it ends there.
 */
export function analysisLook(improvement: Improvement): StatusLook {
  const { status, attempts } = improvement;
  if (status === 'created') {
    return PENDING;
  }
  if (status === 'analyzing') {
    return RUNNING;
  }
  return attempts.length === 0 && hasEnded(improvement)
    ? IMPROVEMENT_STATUS[status]
    : PASSED;
}

function step(id: string, look: StatusLook, title: string): TimelineStep {
  return { id, look, title, done: look === PASSED };
}

/** Every attempt so far, then the ones the limit still allows. */
function attemptSteps(improvement: Improvement): TimelineStep[] {
  const { attempts, budget } = improvement;
  const planned = isTrying(improvement) ? budget.attempts : 0;
  return Array.from({ length: Math.max(planned, attempts.length) }, (_, at) => {
    const attempt = attempts[at];
    const look = attempt === undefined ? PENDING : attemptLook(attempt);
    return {
      id: `attempt-${String(at + 1)}`,
      look,
      title: `Attempt ${String(at + 1)}`,
      done: attempt?.status === 'closed',
    };
  });
}

/** In review mode a person approves before the pull request is opened. */
function finishSteps(improvement: Improvement): TimelineStep[] {
  const approved =
    improvement.mode === 'review' ? [step('approve', PASSED, 'Approved')] : [];
  switch (improvement.status) {
    case 'awaiting_approval':
      return [
        step('approve', IMPROVEMENT_STATUS.awaiting_approval, 'Approve'),
        step('publish', PENDING, 'Publish'),
      ];
    case 'publishing':
      return [...approved, step('publish', RUNNING, 'Publish')];
    case 'completed':
      return [...approved, step('publish', PASSED, 'Published')];
    default:
      return [step('publish', PENDING, 'Publish')];
  }
}

/** The whole path of the work, from the analysis to the pull request. */
function pathOf(improvement: Improvement): TimelineStep[] {
  return [
    step('analyze', analysisLook(improvement), 'Analyze'),
    ...attemptSteps(improvement),
    ...finishSteps(improvement),
  ];
}

/**
 * The step line above the panels: the whole path, the status, and the
 * time passed since the improvement was asked for.
 */
export function StepLine({
  improvement,
  now,
}: {
  readonly improvement: Improvement;
  readonly now: string;
}): ReactNode {
  const passed = elapsedMs(improvement.createdAt, endOf(improvement, now));
  return (
    <Box flexGrow={1} justifyContent="space-between" gap={GAP}>
      <Timeline steps={pathOf(improvement)} variant="line" />
      <Box flexShrink={0} gap={GAP}>
        <StatusIndicator look={IMPROVEMENT_STATUS[improvement.status]} />
        <RoleText>{durationWords(passed)}</RoleText>
      </Box>
    </Box>
  );
}
