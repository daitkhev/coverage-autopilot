import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type { SnapshotSummary } from '@coverage-autopilot/api-contracts/snapshots';

import { CounterPercent } from '#components/coverage-change';
import { type Fact, FactLine, warningFact } from '#components/fact-line';
import { RoleText } from '#components/role-text';
import { failingTestsWords, percentWords, thresholdLabel } from '#theme/counts';
import { ageWords } from '#theme/moments';
import { repositoryName, shortHash } from '#theme/names';
import { GAP, type Layout } from '#theme/widths';

/** The branch moved since the scan: a warning, with its symbol. */
const OUTDATED: Fact = warningFact('outdated');

/** The install of the repository runs its code. */
const TRUSTED: Fact = { text: 'trusted install', role: 'warning' };

function Total({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Text>
      <RoleText role="secondary">{`${label} `}</RoleText>
      {children}
    </Text>
  );
}

/**
 * The totals of the snapshot, the branches only in the wide layout, and
 * the threshold that split it, marked when the repository has its own.
 */
function Totals({
  repository,
  snapshot,
  layout,
}: {
  readonly repository: Repository;
  readonly snapshot: SnapshotSummary;
  readonly layout: Layout;
}): ReactNode {
  const { threshold, totals } = snapshot;
  return (
    <Box gap={GAP} flexShrink={0}>
      <Total label="Lines">
        <CounterPercent
          counter={totals.lines}
          threshold={threshold.percentage}
        />
      </Total>
      {layout === 'wide' ? (
        <Total label="Branches">
          <CounterPercent
            counter={totals.branches}
            threshold={threshold.percentage}
          />
        </Total>
      ) : null}
      <Total label={thresholdLabel(repository.threshold)}>
        <RoleText role="emphasis">
          {percentWords(threshold.percentage)}
        </RoleText>
      </Total>
    </Box>
  );
}

/**
 * What the screen is about: the repository, the commit of its latest
 * snapshot and its age, whether its install is trusted, and the totals
 * beside the threshold. Below the wide layout the branches are left out.
 * When tests failed in the sandbox at the scan, a line below says how
 * many.
 */
export function RepositoryLine({
  repository,
  snapshot,
  now,
  layout,
}: {
  readonly repository: Repository;
  readonly snapshot: SnapshotSummary;
  readonly now: string;
  readonly layout: Layout;
}): ReactNode {
  const failing = failingTestsWords(snapshot.tests);
  return (
    <Box flexGrow={1} flexDirection="column">
      <Box justifyContent="space-between" gap={GAP}>
        <FactLine
          facts={[
            { text: repositoryName(repository), role: 'primary' },
            { text: shortHash(snapshot.commitSha), role: 'primary' },
            { text: `scanned ${ageWords(snapshot.capturedAt, now)} ago` },
            ...(repository.outdated ? [OUTDATED] : []),
            ...(repository.install.mode === 'trusted' ? [TRUSTED] : []),
          ]}
        />
        <Totals repository={repository} snapshot={snapshot} layout={layout} />
      </Box>
      {failing === null ? null : <FactLine facts={[warningFact(failing)]} />}
    </Box>
  );
}
