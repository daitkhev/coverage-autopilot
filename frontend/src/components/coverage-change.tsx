import { Box } from 'ink';
import type { ReactNode } from 'react';

import type { CoverageCounter } from '@coverage-autopilot/api-contracts/coverage';

import { type Coverage, CoverageBar } from '#components/coverage-bar';
import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { coverageRoleOf } from '#theme/bars';
import { percentWords, ratioWords } from '#theme/counts';
import { PERCENT_CELLS } from '#theme/widths';

/** The cells of the name of a counter, as "Functions". */
const LABEL_CELLS = 10;

/** A counter with nothing to count has no percentage, so it is no code. */
export function counterCoverage(counter: CoverageCounter): Coverage {
  return counter.percentage === null
    ? { state: 'no_executable_code' }
    : { state: 'measured', percent: counter.percentage };
}

/** A counter as its percentage, or as `0/0` when it has nothing to count. */
export function CounterPercent({
  counter,
  threshold,
}: {
  readonly counter: CoverageCounter;
  readonly threshold: number;
}): ReactNode {
  return counter.percentage === null ? (
    <RoleText role="secondary">
      {ratioWords(counter.covered, counter.total)}
    </RoleText>
  ) : (
    <RoleText role={coverageRoleOf(counter.percentage, threshold)}>
      {percentWords(counter.percentage)}
    </RoleText>
  );
}

interface CoverageChangeProps {
  /** The name of the counter, such as "Lines". */
  readonly label: string;
  readonly before: CoverageCounter;
  readonly after: CoverageCounter;
  readonly threshold: number;
  /** The cells of the bar of the counter after the change. */
  readonly cells: number;
}

/**
 * One counter before and after a change: the percentage before, an arrow,
 * and the bar after it with the threshold tick. Both numbers come from
 * the service, so the change between them is shown and never computed.
 */
export function CoverageChange({
  label,
  before,
  after,
  threshold,
  cells,
}: CoverageChangeProps): ReactNode {
  return (
    <Box gap={1}>
      <Box width={LABEL_CELLS} flexShrink={0}>
        <RoleText role="secondary">{label}</RoleText>
      </Box>
      <Box width={PERCENT_CELLS} flexShrink={0} justifyContent="flex-end">
        <CounterPercent counter={before} threshold={threshold} />
      </Box>
      <Glyph name="change" role="secondary" />
      <CoverageBar
        coverage={counterCoverage(after)}
        threshold={threshold}
        cells={cells}
      />
    </Box>
  );
}
