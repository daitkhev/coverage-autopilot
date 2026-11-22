import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type {
  Attempt,
  MutantCounts,
} from '@coverage-autopilot/api-contracts/attempts';
import type { CoverageCounters } from '@coverage-autopilot/api-contracts/coverage';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { AnswerList } from '#components/answer-list';
import { Clipped } from '#components/clipped';
import { CoverageChange } from '#components/coverage-change';
import { Glyph } from '#components/glyph';
import { Panel } from '#components/panel';
import { RoleText } from '#components/role-text';
import { Section } from '#components/section';
import {
  type AttemptResult,
  resultsOf,
} from '#screens/improvement/attempt-words';
import {
  acceptedOf,
  endOf,
  lastJudgedOf,
} from '#screens/improvement/improvement-answer';
import {
  FAILURE_WORDS,
  SKIP_WORDS,
} from '#screens/improvement/improvement-words';
import { ageWords } from '#theme/moments';
import {
  attemptLook,
  IMPROVEMENT_STATUS,
  type StatusLook,
} from '#theme/status';
import { BAR_CELLS, GAP } from '#theme/widths';

/** A next step of a failed improvement, which `enter` takes. */
export interface Choice {
  readonly label: string;
  readonly run: () => void;
}

/** The cells of the name of a row, as "Mutants". */
const LABEL_CELLS = 10;

/** The counters a change is shown for, as the mock-ups name them. */
const COUNTERS = [
  ['Lines', 'lines'],
  ['Branches', 'branches'],
  ['Functions', 'functions'],
] as const;

/** How the work ended: a sentence, its stable code, and the lines below. */
interface Headline {
  readonly look: StatusLook;
  readonly title: string;
  readonly code?: string;
  readonly lines: readonly AttemptResult[];
}

function failedHeadline(improvement: Improvement, look: StatusLook): Headline {
  const { failure } = improvement;
  return failure === null
    ? { look, title: 'Failed', lines: [] }
    : {
        look,
        title: FAILURE_WORDS[failure.reason].headline,
        code: failure.reason,
        lines: [{ text: failure.message }],
      };
}

function skippedHeadline(improvement: Improvement, look: StatusLook): Headline {
  const { skip } = improvement;
  return skip === null
    ? { look, title: 'Skipped', lines: [] }
    : {
        look,
        title: SKIP_WORDS[skip.reason],
        code: skip.reason,
        lines: [{ text: skip.message }],
      };
}

function completedHeadline(
  improvement: Improvement,
  look: StatusLook,
): Headline {
  const { pullRequest, branch } = improvement;
  if (pullRequest === null) {
    return { look, title: 'Completed', lines: [] };
  }
  const lines: AttemptResult[] = [
    { text: pullRequest.url, role: 'link' },
    ...(branch === null ? [] : [{ text: `from the branch ${branch}` }]),
  ];
  return { look, title: 'Pull request opened', lines };
}

function headlineOf(improvement: Improvement, now: string): Headline {
  const look = IMPROVEMENT_STATUS[improvement.status];
  switch (improvement.status) {
    case 'failed':
      return failedHeadline(improvement, look);
    case 'skipped':
      return skippedHeadline(improvement, look);
    case 'completed':
      return completedHeadline(improvement, look);
    default: {
      const age = ageWords(endOf(improvement, now), now);
      const text = `Cancelled ${age} ago. Nothing was published.`;
      return { look, title: 'Cancelled', lines: [{ text }] };
    }
  }
}

function HeadlineLines({
  headline,
}: {
  readonly headline: Headline;
}): ReactNode {
  const { look } = headline;
  return (
    <Box flexDirection="column">
      <Box gap={GAP}>
        <Text>
          <Glyph name={look.glyph} role={look.role} />{' '}
          <RoleText role={look.role} bold>
            {headline.title}
          </RoleText>
        </Text>
        {headline.code === undefined ? null : (
          <RoleText role="secondary">{headline.code}</RoleText>
        )}
      </Box>
      {headline.lines.map((line) => (
        <Box key={line.text} paddingLeft={GAP}>
          <RoleText {...(line.role === undefined ? {} : { role: line.role })}>
            {line.text}
          </RoleText>
        </Box>
      ))}
    </Box>
  );
}

/** The numbers of one attempt: the file before and after it, and its mutants. */
interface Measured {
  readonly number: number;
  readonly before: CoverageCounters;
  readonly after: CoverageCounters;
  readonly mutants: MutantCounts | null;
}

/**
 * The attempt whose numbers the ending shows: the accepted one, or the
 * last one the gate judged. A gate that stopped early measured nothing.
 */
function measuredOf(improvement: Improvement): Measured | undefined {
  const attempt =
    improvement.status === 'completed'
      ? acceptedOf(improvement)
      : lastJudgedOf(improvement);
  const report = attempt?.report ?? null;
  if (attempt === undefined || report === null) {
    return undefined;
  }
  const { coverageBefore: before, coverageAfter: after, mutants } = report;
  return before === null || after === null
    ? undefined
    : { number: attempt.number, before, after, mutants };
}

/** The coverage of the file before and after the attempt, and its mutants. */
function Change({
  improvement,
  threshold,
}: {
  readonly improvement: Improvement;
  readonly threshold: number;
}): ReactNode {
  const measured = measuredOf(improvement);
  if (measured === undefined) {
    return null;
  }
  const { before, after, mutants } = measured;
  return (
    <Section title={`BEFORE AND AFTER ATTEMPT ${String(measured.number)}`}>
      {COUNTERS.map(([label, counter]) => (
        <CoverageChange
          key={counter}
          label={label}
          before={before[counter]}
          after={after[counter]}
          threshold={threshold}
          cells={BAR_CELLS.detail}
        />
      ))}
      {mutants === null ? null : (
        <Box gap={1}>
          <Box width={LABEL_CELLS} flexShrink={0}>
            <RoleText role="secondary">Mutants</RoleText>
          </Box>
          <RoleText>{`${String(mutants.killed)} of ${String(mutants.undetectedBefore)} detected by the new tests`}</RoleText>
        </Box>
      )}
    </Section>
  );
}

function AttemptRow({ attempt }: { readonly attempt: Attempt }): ReactNode {
  const look = attemptLook(attempt);
  const [result] = resultsOf(attempt);
  return (
    <Box gap={GAP}>
      <Box flexShrink={0} gap={GAP}>
        <Text>
          <Glyph name={look.glyph} role={look.role} />{' '}
          {`Attempt ${String(attempt.number)}`}
        </Text>
        <RoleText role={look.role}>{look.word}</RoleText>
      </Box>
      <Box flexGrow={1} justifyContent="flex-end">
        <RoleText role="secondary" truncate>
          {result?.text ?? ''}
        </RoleText>
      </Box>
    </Box>
  );
}

function WhatNow({
  next,
  choices,
  chosen,
  focused,
}: {
  readonly next: string;
  readonly choices: readonly Choice[];
  readonly chosen: number;
  readonly focused: boolean;
}): ReactNode {
  return (
    <Section title="WHAT NOW">
      <RoleText>{next}</RoleText>
      <Box marginTop={1}>
        <AnswerList answers={choices} selected={chosen} focused={focused} />
      </Box>
    </Section>
  );
}

interface EndingProps {
  readonly improvement: Improvement;
  /** The threshold of the repository, when it has a snapshot. */
  readonly threshold: number | undefined;
  readonly now: string;
  readonly focused: boolean;
  /** The next steps of a failed improvement, and the chosen one. */
  readonly choices: readonly Choice[];
  readonly chosen: number;
}

/**
 * How the work ended: the pull request, the reason of a failure or a
 * skip, or the cancel; the coverage before and after; every attempt; and
 * for a failure, what to do next as a choice. Only a failure is red.
 */
export function Ending(props: EndingProps): ReactNode {
  const { improvement, threshold, choices, focused } = props;
  const { failure, attempts } = improvement;
  return (
    <Panel
      title="Improvement"
      note={improvement.id}
      focused={focused}
      {...(improvement.status === 'failed' ? { tone: 'danger' } : {})}
    >
      <Clipped>
        <HeadlineLines headline={headlineOf(improvement, props.now)} />
        {threshold === undefined ? null : (
          <Change improvement={improvement} threshold={threshold} />
        )}
        {attempts.length === 0 ? null : (
          <Section title="ATTEMPTS">
            {attempts.map((attempt) => (
              <AttemptRow key={attempt.number} attempt={attempt} />
            ))}
          </Section>
        )}
        {failure === null || choices.length === 0 ? null : (
          <WhatNow
            next={FAILURE_WORDS[failure.reason].next}
            choices={choices}
            chosen={props.chosen}
            focused={focused}
          />
        )}
      </Clipped>
    </Panel>
  );
}
