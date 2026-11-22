import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type {
  CheckResult,
  VerificationReport,
} from '@coverage-autopilot/api-contracts/attempts';
import type { CoverageCounter } from '@coverage-autopilot/api-contracts/coverage';
import type {
  Improvement,
  ImprovementPatch,
} from '@coverage-autopilot/api-contracts/improvements';

import { Clipped } from '#components/clipped';
import { CounterPercent } from '#components/coverage-change';
import { type GateCheck, GateChecks } from '#components/gate-checks';
import { Glyph } from '#components/glyph';
import { Panel } from '#components/panel';
import { RoleText } from '#components/role-text';
import { Section } from '#components/section';
import { StatusIndicator } from '#components/status-indicator';
import { durationWords } from '#theme/moments';
import { shortHash } from '#theme/names';
import { ATTEMPT_VERDICT } from '#theme/status';
import { GAP, PERCENT_CELLS } from '#theme/widths';

/** The cells of the name of a counter, as "Branches". */
const LABEL_CELLS = 10;

/** The counters the evidence shows, as the mock-ups name them. */
const COUNTERS = [
  ['Lines', 'lines'],
  ['Branches', 'branches'],
] as const;

function checkOf(check: CheckResult): GateCheck {
  return {
    name: check.name,
    status: check.status,
    ...(check.durationMs === null
      ? {}
      : { time: durationWords(check.durationMs) }),
  };
}

/** A counter before and after the patch, both as the service sent them. */
function Change({
  label,
  before,
  after,
  threshold,
}: {
  readonly label: string;
  readonly before: CoverageCounter;
  readonly after: CoverageCounter;
  readonly threshold: number;
}): ReactNode {
  return (
    <Box gap={1}>
      <Box width={LABEL_CELLS} flexShrink={0}>
        <RoleText role="secondary">{label}</RoleText>
      </Box>
      <Box width={PERCENT_CELLS} justifyContent="flex-end">
        <CounterPercent counter={before} threshold={threshold} />
      </Box>
      <Glyph name="change" role="secondary" />
      <CounterPercent counter={after} threshold={threshold} />
    </Box>
  );
}

function Coverage({
  report,
  threshold,
}: {
  readonly report: VerificationReport;
  readonly threshold: number;
}): ReactNode {
  const { coverageBefore: before, coverageAfter: after } = report;
  if (before === null || after === null) {
    return null;
  }
  return (
    <Section title="COVERAGE OF THE FILE">
      {COUNTERS.map(([label, counter]) => (
        <Change
          key={counter}
          label={label}
          before={before[counter]}
          after={after[counter]}
          threshold={threshold}
        />
      ))}
    </Section>
  );
}

function Verdict({
  report,
  patch,
}: {
  readonly report: VerificationReport;
  readonly patch: ImprovementPatch;
}): ReactNode {
  const look = ATTEMPT_VERDICT[report.verdict];
  return (
    <Box gap={GAP}>
      <StatusIndicator look={{ ...look, word: look.word.toUpperCase() }} />
      <Text wrap="truncate-end">
        <RoleText role="secondary">
          {`attempt ${String(patch.attemptNumber)} · patch ${shortHash(patch.patchHash)}`}
        </RoleText>
      </Text>
    </Box>
  );
}

interface EvidenceProps {
  readonly improvement: Improvement;
  readonly patch: ImprovementPatch;
  /** The threshold of the repository, when it has a snapshot. */
  readonly threshold: number | undefined;
  readonly focused: boolean;
}

/**
 * Why the patch may be published: the verdict of the gate, the coverage
 * of the file before and after, the mutants the new tests detect, and the
 * seven checks with their times.
 */
export function Evidence({
  improvement,
  patch,
  threshold,
  focused,
}: EvidenceProps): ReactNode {
  const report =
    improvement.attempts.find(
      (attempt) => attempt.number === patch.attemptNumber,
    )?.report ?? null;
  return (
    <Panel title="Evidence" focused={focused}>
      {report === null ? (
        <RoleText role="secondary">
          The gate wrote no report for this patch.
        </RoleText>
      ) : (
        <Clipped>
          <Verdict report={report} patch={patch} />
          {threshold === undefined ? null : (
            <Coverage report={report} threshold={threshold} />
          )}
          {report.mutants === null ? null : (
            <Section title="MUTANTS">
              <RoleText>{`${String(report.mutants.killed)} of ${String(report.mutants.undetectedBefore)} now detected by the new tests`}</RoleText>
            </Section>
          )}
          <Section title="CHECKS">
            <GateChecks checks={report.checks.map(checkOf)} />
          </Section>
        </Clipped>
      )}
    </Panel>
  );
}
