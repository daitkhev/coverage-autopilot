import { Box } from 'ink';
import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { RepositoryThreshold } from '@coverage-autopilot/api-contracts/repositories';
import type {
  ScanParameters,
  SnapshotSummary,
} from '@coverage-autopilot/api-contracts/snapshots';

import { CoverageBar } from '#components/coverage-bar';
import { counterCoverage } from '#components/coverage-change';
import { EmptyState } from '#components/empty-state';
import { type Fact, FactLine, warningFact } from '#components/fact-line';
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
  runnerWords,
} from '#screens/repositories/repository-words';
import {
  COUNTER_NAMES,
  COUNTERS,
  failingTestsWords,
  percentWords,
  thresholdLabel,
} from '#theme/counts';
import { ageWords } from '#theme/moments';
import { IMPROVEMENT_STATUS } from '#theme/status';
import { GAP } from '#theme/widths';

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
  /** How the latest snapshot was measured, once the service said it. */
  readonly parameters?: ScanParameters | undefined;
}

/**
 * What the counters are held to, marked when the repository has one of
 * its own, and the test runner that measured them.
 */
function measuredFacts(
  threshold: RepositoryThreshold,
  parameters: ScanParameters | undefined,
): Fact[] {
  const { percentage, metric } = threshold;
  return [
    {
      text: `${thresholdLabel(threshold)} ${percentWords(percentage)} of ${metric}`,
    },
    ...(parameters === undefined ? [] : [{ text: runnerWords(parameters) }]),
  ];
}

function Measured({
  snapshot,
  judgedBy,
  cells,
  parameters,
}: {
  readonly snapshot: SnapshotSummary;
  /** The threshold of the repository, which split the snapshot. */
  readonly judgedBy: RepositoryThreshold;
  readonly cells: number;
  readonly parameters: ScanParameters | undefined;
}): ReactNode {
  const { threshold, totals, files } = snapshot;
  const failing = failingTestsWords(snapshot.tests);
  return (
    <>
      <Section title="COVERAGE">
        <FactLine facts={measuredFacts(judgedBy, parameters)} />
        {failing === null ? null : <FactLine facts={[warningFact(failing)]} />}
        {COUNTERS.map((metric) => (
          <FactRow key={metric} label={COUNTER_NAMES[metric]}>
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
 * the test runner that measured them, how its files divide, and its
 * latest work.
 */
export function RepositoryDetails({
  row,
  starting,
  work,
  now,
  cells,
  parameters,
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
        <Measured
          snapshot={snapshot}
          judgedBy={repository.threshold}
          cells={cells}
          parameters={parameters}
        />
      )}
      <Section title="WORK">
        <Work items={workItemsOf(work, repository.id)} now={now} />
      </Section>
    </>
  );
}
