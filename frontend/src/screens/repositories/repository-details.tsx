import { Box } from 'ink';
import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { SnapshotSummary } from '@coverage-autopilot/api-contracts/snapshots';
import type { CoverageMetric } from '@coverage-autopilot/api-contracts/statuses';

import { CoverageBar } from '#components/coverage-bar';
import { counterCoverage } from '#components/coverage-change';
import { EmptyState } from '#components/empty-state';
import { FactLine } from '#components/fact-line';
import { FactRow } from '#components/fact-row';
import { RoleText } from '#components/role-text';
import { Section } from '#components/section';
import { StatusIndicator } from '#components/status-indicator';
import type {
  RepositoryRow,
  RepositoryWork,
} from '#screens/repositories/repository-listing';
import {
  detailFacts,
  rowStateOf,
} from '#screens/repositories/repository-words';
import { percentWords } from '#theme/counts';
import { ageWords } from '#theme/moments';
import { IMPROVEMENT_STATUS } from '#theme/status';
import { GAP } from '#theme/widths';

/** The four counters, in the order the mock-ups list them. */
const COUNTERS: readonly (readonly [CoverageMetric, string])[] = [
  ['lines', 'Lines'],
  ['branches', 'Branches'],
  ['functions', 'Functions'],
  ['statements', 'Statements'],
];

/** The latest work that fits beside the counters at the smallest size. */
const WORK_ROWS = 3;

/** The cells of the widest status, `■ CANCEL`. */
const STATUS_CELLS = 8;

interface RepositoryDetailsProps {
  readonly row: RepositoryRow;
  /** A scan of it was started here, and the list does not know it yet. */
  readonly starting: boolean;
  readonly work: RepositoryWork | undefined;
  readonly now: string;
  /** The cells of a bar, which the width of the panel decides. */
  readonly cells: number;
}

function Measured({
  snapshot,
  cells,
}: {
  readonly snapshot: SnapshotSummary;
  readonly cells: number;
}): ReactNode {
  const { threshold, totals, files } = snapshot;
  return (
    <>
      <Section title="COVERAGE">
        <RoleText role="secondary">
          {`threshold ${percentWords(threshold.percentage)} of ${threshold.metric}`}
        </RoleText>
        {COUNTERS.map(([metric, label]) => (
          <FactRow key={metric} label={label}>
            <CoverageBar
              coverage={counterCoverage(totals[metric])}
              threshold={threshold.percentage}
              cells={cells}
            />
          </FactRow>
        ))}
      </Section>
      <Section title="FILES">
        <FactLine
          facts={[
            {
              text: `${String(files.below)} below ${percentWords(threshold.percentage)}`,
              role: 'primary',
            },
            { text: `${String(files.above)} at or above`, role: 'primary' },
          ]}
        />
        <FactLine
          facts={[
            { text: `${String(files.unmeasured)} not measured` },
            { text: `${String(files.noCode)} no code` },
          ]}
        />
      </Section>
    </>
  );
}

/** No snapshot yet: the first scan runs, or `s` starts it. */
function NotMeasured({ scanning }: { readonly scanning: boolean }): ReactNode {
  return scanning ? (
    <RoleText role="secondary">
      The first scan runs. Its coverage shows when it ends.
    </RoleText>
  ) : (
    <EmptyState sentence="Not scanned yet." keyName="s" action="to scan it" />
  );
}

/** The work of the repository, or why it is not shown yet. */
function workItemsOf(
  work: RepositoryWork | undefined,
  repositoryId: string,
): readonly Improvement[] | string {
  if (work?.repositoryId !== repositoryId) {
    return 'asking the service';
  }
  return work.answer.outcome === 'answered'
    ? work.answer.value.items.slice(0, WORK_ROWS)
    : work.answer.error.message;
}

function Work({
  items,
  now,
}: {
  readonly items: readonly Improvement[] | string;
  readonly now: string;
}): ReactNode {
  if (typeof items === 'string') {
    return <RoleText role="secondary">{items}</RoleText>;
  }
  if (items.length === 0) {
    return <RoleText role="secondary">No improvements yet.</RoleText>;
  }
  return items.map((improvement) => (
    <Box key={improvement.id} gap={GAP}>
      <Box width={STATUS_CELLS} flexShrink={0}>
        <StatusIndicator look={IMPROVEMENT_STATUS[improvement.status]} />
      </Box>
      <Box flexGrow={1}>
        <RoleText truncate>{improvement.targetFile}</RoleText>
      </Box>
      <RoleText role="secondary">
        {ageWords(improvement.updatedAt, now)}
      </RoleText>
    </Box>
  ));
}

/**
 * The selected repository: its latest snapshot with the four counters,
 * how its files divide, and its latest work.
 */
export function RepositoryDetails({
  row,
  starting,
  work,
  now,
  cells,
}: RepositoryDetailsProps): ReactNode {
  const { repository } = row;
  const snapshot = repository.latestSnapshot;
  const state = rowStateOf({ repository, starting });
  return (
    <>
      <FactLine facts={detailFacts(row, { state, now })} />
      {snapshot === null ? (
        <Box marginTop={1}>
          <NotMeasured scanning={state === 'scanning'} />
        </Box>
      ) : (
        <Measured snapshot={snapshot} cells={cells} />
      )}
      <Section title="WORK">
        <Work items={workItemsOf(work, repository.id)} now={now} />
      </Section>
    </>
  );
}
