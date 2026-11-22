import { Box } from 'ink';
import type { ReactNode } from 'react';

import { CoverageBar } from '#components/coverage-bar';
import { FactLine } from '#components/fact-line';
import { Glyph } from '#components/glyph';
import { ProgressMeter } from '#components/progress-meter';
import { RoleText } from '#components/role-text';
import type { RepositoryRow } from '#screens/repositories/repository-listing';
import {
  coverageOf,
  ROW_LOOKS,
  rowFacts,
  type RowState,
  rowStateOf,
  stepAt,
} from '#screens/repositories/repository-words';
import { BAR_CELLS, GAP } from '#theme/widths';

/** The cells of the count of files below the threshold, `999 below`. */
const BELOW_CELLS = 9;

interface RepositoryRowLinesProps {
  readonly row: RepositoryRow;
  /** A scan of it was started here, and the list does not know it yet. */
  readonly starting: boolean;
  readonly bold: boolean;
  readonly now: string;
}

/** How far a scan has come, or the coverage of the latest snapshot. */
function Measure({
  row,
  state,
}: {
  readonly row: RepositoryRow;
  readonly state: RowState;
}): ReactNode {
  const snapshot = row.repository.latestSnapshot;
  if (state === 'scanning') {
    const steps = row.scan?.progress?.steps ?? [];
    return steps.length === 0 ? null : (
      <ProgressMeter
        kind="steps"
        used={stepAt(steps) + 1}
        total={steps.length}
        cells={BAR_CELLS.list}
      />
    );
  }
  if (snapshot === null) {
    return <RoleText role="secondary">not scanned</RoleText>;
  }
  return (
    <Box gap={GAP} flexShrink={0}>
      <CoverageBar
        coverage={coverageOf(snapshot.totals[snapshot.threshold.metric])}
        threshold={snapshot.threshold.percentage}
        cells={BAR_CELLS.list}
      />
      <Box width={BELOW_CELLS} justifyContent="flex-end">
        <RoleText>{`${String(snapshot.files.below)} below`}</RoleText>
      </Box>
    </Box>
  );
}

/**
 * A repository on two lines: its state, its name and its coverage, then
 * the branch and the scan that runs or the latest snapshot.
 */
export function RepositoryRowLines({
  row,
  starting,
  bold,
  now,
}: RepositoryRowLinesProps): ReactNode {
  const { repository } = row;
  const state = rowStateOf({ repository, starting });
  const look = ROW_LOOKS[state];
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Glyph name={look.glyph} role={look.role} />
        <Box flexGrow={1}>
          <RoleText bold={bold} truncate>
            {`${repository.owner}/${repository.name}`}
          </RoleText>
        </Box>
        <Measure row={row} state={state} />
      </Box>
      <Box paddingLeft={GAP}>
        <FactLine facts={rowFacts(row, { state, now })} />
      </Box>
    </Box>
  );
}
