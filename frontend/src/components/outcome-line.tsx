import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';

import { Glyph } from '#components/glyph';
import { FAULT, REFUSED } from '#components/problem-details';
import { RoleText } from '#components/role-text';
import type { StatusLook } from '#theme/status';
import { GAP } from '#theme/widths';

/** A sentence in the colour of its look, its symbol first, a code beside. */
function LookLine({
  look,
  sentence,
  code,
}: {
  readonly look: StatusLook;
  readonly sentence: string;
  readonly code?: string;
}): ReactNode {
  return (
    <Box gap={GAP}>
      <Text>
        <Glyph name={look.glyph} role={look.role} />{' '}
        <RoleText role={look.role}>{sentence}</RoleText>
      </Text>
      {code === undefined ? null : <RoleText role="secondary">{code}</RoleText>}
    </Box>
  );
}

/** Something runs and the screen waits for it: `⠋ Sending your decision`. */
export function BusyLine({ doing }: { readonly doing: string }): ReactNode {
  return (
    <Text>
      <Glyph name="spinner" role="running" /> <RoleText>{doing}</RoleText>
    </Text>
  );
}

/** What the service refused with, in yellow, with its stable code beside. */
export function RefusalLine({
  error,
}: {
  readonly error: ErrorBody;
}): ReactNode {
  return (
    <LookLine look={REFUSED} sentence={error.message} code={error.error} />
  );
}

/** A request that nothing answered, in red: `✕ Nothing answered the cancel`. */
export function FaultLine({
  sentence,
}: {
  readonly sentence: string;
}): ReactNode {
  return <LookLine look={FAULT} sentence={sentence} />;
}
