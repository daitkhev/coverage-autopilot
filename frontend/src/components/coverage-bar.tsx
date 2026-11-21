import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { Bar } from '#components/bar';
import { RoleText } from '#components/role-text';
import { coverageRoleOf, fractionOfPercent } from '#theme/bars';
import { FILE_STATE } from '#theme/status';
import { GAP, PERCENT_CELLS } from '#theme/widths';

interface MeasuredCoverage {
  readonly state: 'measured';
  readonly percent: number;
}

interface CoverageWithoutCode {
  readonly state: 'no_executable_code';
}

interface UnmeasuredCoverage {
  readonly state: 'unmeasured';
  /** The reason in plain words, as the status tables say it. */
  readonly reason: string;
}

/** What the service knows of the coverage of a file. */
export type Coverage =
  MeasuredCoverage | CoverageWithoutCode | UnmeasuredCoverage;

interface CoverageBarProps {
  readonly coverage: Coverage;
  readonly threshold: number;
  readonly cells: number;
}

/** A file without numbers has no bar and no percentage, never 0%. */
function WithoutNumbers({
  coverage,
}: {
  readonly coverage: CoverageWithoutCode | UnmeasuredCoverage;
}): ReactNode {
  const look = FILE_STATE[coverage.state];
  const words = coverage.state === 'unmeasured' ? coverage.reason : look.word;
  return (
    <Box gap={GAP}>
      <RoleText role={look.role}>{look.figure}</RoleText>
      <RoleText role="secondary" truncate>
        {words}
      </RoleText>
    </Box>
  );
}

/** A bar with its threshold tick, and the percentage beside it. */
export function CoverageBar({
  coverage,
  threshold,
  cells,
}: CoverageBarProps): ReactNode {
  if (coverage.state !== 'measured') {
    return <WithoutNumbers coverage={coverage} />;
  }
  const role = coverageRoleOf(coverage.percent, threshold);
  const shape = {
    filled: fractionOfPercent(coverage.percent),
    cells,
    tick: fractionOfPercent(threshold),
  };
  return (
    <Box flexShrink={0}>
      <Bar shape={shape} role={role} />
      <Box width={PERCENT_CELLS + GAP} justifyContent="flex-end">
        <Text>
          <RoleText role={role}>{`${coverage.percent.toFixed(1)}%`}</RoleText>
        </Text>
      </Box>
    </Box>
  );
}
