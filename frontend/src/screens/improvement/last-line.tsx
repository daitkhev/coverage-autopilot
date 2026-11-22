import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { checkWordsOf } from '#components/gate-checks';
import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { DOING, WAITING_FOR } from '#screens/improvement/improvement-words';
import {
  ageWords,
  clockWords,
  isOlderThan,
  STALE_AFTER_MS,
} from '#theme/moments';
import { IMPROVEMENT_STATUS, type StatusLook } from '#theme/status';
import { GAP } from '#theme/widths';

/** A worker that stopped reporting does not look busy. */
const QUIET: StatusLook = {
  glyph: 'attention',
  word: 'quiet',
  role: 'warning',
};

/** What the service does now: what it waits for, or the step it runs. */
function doingWords(improvement: Improvement, timeZone: string): string {
  const { waitingFor, resumesAt } = improvement;
  if (waitingFor !== null) {
    const until =
      resumesAt === null ? '' : ` at ${clockWords(resumesAt, timeZone)}`;
    return `Waiting for ${WAITING_FOR[waitingFor]}${until}`;
  }
  const running = improvement.progress?.steps.find(
    (step) => step.status === 'running',
  );
  const doing = DOING[improvement.status];
  return running === undefined
    ? doing
    : `${doing}: ${checkWordsOf(running.code)}`;
}

interface LastLineProps {
  readonly improvement: Improvement;
  readonly now: string;
  readonly timeZone: string;
}

/**
 * What the service does and how old that knowledge is. A worker writes
 * its steps while it works, so steps older than ten seconds turn yellow;
 * a wait for a person or a limit writes nothing and is never late.
 */
export function LastLine({
  improvement,
  now,
  timeZone,
}: LastLineProps): ReactNode {
  const moment = improvement.progress?.updatedAt ?? improvement.updatedAt;
  const late =
    improvement.waitingFor === null && isOlderThan(moment, now, STALE_AFTER_MS);
  const look = late ? QUIET : IMPROVEMENT_STATUS[improvement.status];
  return (
    <Box gap={GAP}>
      <Text>
        <Glyph name={look.glyph} role={look.role} />{' '}
        <RoleText role="emphasis">{doingWords(improvement, timeZone)}</RoleText>
      </Text>
      <Box flexShrink={0}>
        <RoleText role={late ? 'warning' : 'secondary'}>
          {`updated ${ageWords(moment, now)} ago`}
        </RoleText>
      </Box>
    </Box>
  );
}
