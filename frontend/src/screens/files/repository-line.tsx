import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type { SnapshotSummary } from '@coverage-autopilot/api-contracts/snapshots';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { CounterPercent } from '#screens/files/file-row';
import { percentWords } from '#theme/counts';
import { ageWords } from '#theme/moments';
import { GAP, type Layout } from '#theme/widths';

/** A commit is named by its first seven characters, as git shows it. */
const SHORT_SHA = 7;

function Dot(): ReactNode {
  return (
    <Text>
      {' '}
      <Glyph name="separator" role="secondary" />{' '}
    </Text>
  );
}

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

/** The totals of the snapshot, the branches only in the wide layout. */
function Totals({
  snapshot,
  layout,
}: {
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
      <Total label="threshold">
        <RoleText role="emphasis">
          {percentWords(threshold.percentage)}
        </RoleText>
      </Total>
    </Box>
  );
}

/**
 * What the screen is about: the repository, the commit of its latest
 * snapshot and its age, and the totals beside the threshold. Below the
 * wide layout the branches are left out.
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
  return (
    <Box flexGrow={1} justifyContent="space-between" gap={GAP}>
      <Text wrap="truncate-end">
        <RoleText>{`${repository.owner}/${repository.name}`}</RoleText>
        <Dot />
        <RoleText>{snapshot.commitSha.slice(0, SHORT_SHA)}</RoleText>
        <Dot />
        <RoleText role="secondary">{`scanned ${ageWords(snapshot.capturedAt, now)} ago`}</RoleText>
        {repository.outdated ? (
          <Text>
            <Dot />
            <Glyph name="attention" role="warning" />{' '}
            <RoleText role="warning">outdated</RoleText>
          </Text>
        ) : null}
      </Text>
      <Totals snapshot={snapshot} layout={layout} />
    </Box>
  );
}
