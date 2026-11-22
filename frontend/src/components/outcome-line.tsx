import { Text } from 'ink';
import type { ReactNode } from 'react';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';

import { Headline } from '#components/error-details';
import { Glyph } from '#components/glyph';
import { FAULT, REFUSED } from '#components/problem-details';
import { RoleText } from '#components/role-text';

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
    <Headline look={REFUSED} headline={error.message} code={error.error} />
  );
}

/** A request that nothing answered, in red: `✕ Nothing answered the cancel`. */
export function FaultLine({
  sentence,
}: {
  readonly sentence: string;
}): ReactNode {
  return <Headline look={FAULT} headline={sentence} />;
}
