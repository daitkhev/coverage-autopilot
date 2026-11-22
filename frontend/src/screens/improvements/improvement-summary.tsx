import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { VerificationReport } from '@coverage-autopilot/api-contracts/attempts';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { type Fact, FactLine } from '#components/fact-line';
import { FactRow } from '#components/fact-row';
import { Glyph } from '#components/glyph';
import { KeyHints } from '#components/key-hints';
import { RoleText } from '#components/role-text';
import { Section } from '#components/section';
import { StatusIndicator } from '#components/status-indicator';
import {
  ageMomentOf,
  besideWords,
  GROUP_LOOKS,
  groupOf,
} from '#screens/improvements/improvement-words';
import { percentWords } from '#theme/counts';
import { ageWords } from '#theme/moments';
import { shortHash } from '#theme/names';
import { ATTEMPT_VERDICT, IMPROVEMENT_STATUS } from '#theme/status';
import { GAP } from '#theme/widths';

/** The heading of what the improvement does now, by what it needs. */
const NOW_TITLES = {
  needsYou: 'WAITING FOR YOU',
  running: 'RUNNING',
  waiting: 'WAITING',
  finished: 'HOW IT ENDED',
} as const;

interface ImprovementSummaryProps {
  readonly improvement: Improvement;
  readonly moment: { readonly now: string; readonly timeZone: string };
}

function headFacts({ attempts }: Improvement): Fact[] {
  const last = attempts.at(-1);
  if (last === undefined) {
    return [];
  }
  const attempt = { text: `attempt ${String(last.number)}` };
  return last.patchHash === null
    ? [attempt]
    : [attempt, { text: `patch ${shortHash(last.patchHash)}` }];
}

/** The number of an attempt the gate judged, and its report. */
interface Judgement {
  readonly number: number;
  readonly report: VerificationReport;
}

/** The last attempt the gate judged, with its report. */
function judgedOf({ attempts }: Improvement): Judgement | undefined {
  return attempts
    .flatMap(({ number, report }) =>
      report === null ? [] : [{ number, report }],
    )
    .at(-1);
}

function Judged({ number, report }: Judgement): ReactNode {
  const before = report.coverageBefore?.lines.percentage ?? null;
  const after = report.coverageAfter?.lines.percentage ?? null;
  return (
    <Section title={`ATTEMPT ${String(number)}`}>
      <StatusIndicator look={ATTEMPT_VERDICT[report.verdict]} />
      {before === null || after === null ? null : (
        <FactRow label="Lines">
          <Text>
            <RoleText>{percentWords(before)}</RoleText>{' '}
            <Glyph name="change" role="secondary" />{' '}
            <RoleText>{percentWords(after)}</RoleText>
          </Text>
        </FactRow>
      )}
      {report.mutants === null ? null : (
        <FactRow label="Mutants">
          <RoleText>{`${String(report.mutants.killed)} of ${String(report.mutants.undetectedBefore)} detected`}</RoleText>
        </FactRow>
      )}
    </Section>
  );
}

/**
 * The selected improvement in short: its status, what it does or waits
 * for, what the gate said of its last judged attempt, and the next step.
 */
export function ImprovementSummary({
  improvement,
  moment,
}: ImprovementSummaryProps): ReactNode {
  const group = groupOf(improvement);
  const judged = judgedOf(improvement);
  return (
    <>
      <Box gap={GAP}>
        <StatusIndicator look={IMPROVEMENT_STATUS[improvement.status]} />
        <FactLine facts={headFacts(improvement)} />
      </Box>
      <Section title={NOW_TITLES[group]}>
        <RoleText>{besideWords(improvement, moment.timeZone)}</RoleText>
        <FactLine
          facts={[
            {
              text: GROUP_LOOKS[group].since(
                ageWords(ageMomentOf(improvement), moment.now),
              ),
            },
          ]}
        />
      </Section>
      {judged === undefined ? null : <Judged {...judged} />}
      <Section title="NEXT">
        <KeyHints hints={[{ key: 'enter', label: GROUP_LOOKS[group].next }]} />
      </Section>
    </>
  );
}
