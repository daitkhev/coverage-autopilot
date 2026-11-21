import { Box, Text } from 'ink';
import { Fragment, type ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { useTheme } from '#hooks/use-theme';
import type { Role } from '#theme/roles';
import type { StatusLook } from '#theme/status';
import { symbolOf } from '#theme/symbols';
import { GAP } from '#theme/widths';

/** A line below a finished step, such as the reason of a rejection. */
interface TimelineResult {
  readonly text: string;
  readonly role?: Role;
}

export interface TimelineStep {
  readonly id: string;
  /** The symbol and the role of the step, from the status tables. */
  readonly look: StatusLook;
  readonly title: string;
  /** Beside the title in the role of the step, such as "rejected". */
  readonly note?: string;
  /** At the right end, such as "4m 03s" or "run 2 of 3". */
  readonly time?: string;
  /** Whether the step is behind the work, so the line after it is heavy. */
  readonly done: boolean;
  readonly results?: readonly TimelineResult[];
  /** What is drawn under the step, such as the checks of an attempt. */
  readonly details?: ReactNode;
}

/**
 * The step line at the top of a screen, the history of the work with the
 * result of each step on the line below it, or the checks of an attempt.
 */
type TimelineVariant = 'line' | 'history' | 'checks';

interface TimelineProps {
  readonly steps: readonly TimelineStep[];
  readonly variant: TimelineVariant;
}

const JOINT_CELLS = 2;

function isRunning(step: TimelineStep): boolean {
  return step.look.role === 'running';
}

/** Heavy behind a finished step, light ahead. */
function Joint({ after }: { readonly after: TimelineStep }): ReactNode {
  const settings = useTheme();
  const glyph = symbolOf(after.done ? 'barFilled' : 'barEmpty', settings);
  return (
    <RoleText role={after.done ? after.look.role : 'border'}>
      {` ${glyph.repeat(JOINT_CELLS)} `}
    </RoleText>
  );
}

function StepLine({
  steps,
}: {
  readonly steps: readonly TimelineStep[];
}): ReactNode {
  return (
    <Text wrap="truncate-end">
      {steps.map((step, index) => {
        const before = steps[index - 1];
        return (
          <Fragment key={step.id}>
            {before === undefined ? null : <Joint after={before} />}
            <Glyph name={step.look.glyph} role={step.look.role} />{' '}
            <RoleText role={isRunning(step) ? 'emphasis' : step.look.role}>
              {step.title}
            </RoleText>
          </Fragment>
        );
      })}
    </Text>
  );
}

function Results({ step }: { readonly step: TimelineStep }): ReactNode {
  return (step.results ?? []).map((result) => (
    <Box key={result.text} paddingLeft={GAP}>
      <Text>
        <Glyph name="result" role="secondary" />{' '}
        <RoleText role={result.role ?? 'secondary'}>{result.text}</RoleText>
      </Text>
    </Box>
  ));
}

function StepRow({
  step,
  bold,
}: {
  readonly step: TimelineStep;
  readonly bold: boolean;
}): ReactNode {
  return (
    <Box flexDirection="column">
      <Box gap={GAP}>
        <Box flexGrow={1} gap={GAP}>
          <Text wrap="truncate-end">
            <Glyph name={step.look.glyph} role={step.look.role} />{' '}
            <RoleText bold={bold}>{step.title}</RoleText>
          </Text>
          {step.note === undefined ? null : (
            <RoleText role={step.look.role}>{step.note}</RoleText>
          )}
        </Box>
        {step.time === undefined ? null : (
          <RoleText role={isRunning(step) ? 'running' : 'primary'}>
            {step.time}
          </RoleText>
        )}
      </Box>
      <Results step={step} />
      {step.details === undefined ? null : (
        <Box flexDirection="column" paddingLeft={GAP}>
          {step.details}
        </Box>
      )}
    </Box>
  );
}

/**
 * The steps of an improvement. In the history a started step is bold; in
 * the checks only the one that runs is.
 */
export function Timeline({ steps, variant }: TimelineProps): ReactNode {
  if (variant === 'line') {
    return <StepLine steps={steps} />;
  }
  return (
    <Box flexDirection="column">
      {steps.map((step) => (
        <StepRow
          key={step.id}
          step={step}
          bold={
            variant === 'history'
              ? step.look.role !== 'secondary'
              : isRunning(step)
          }
        />
      ))}
    </Box>
  );
}
