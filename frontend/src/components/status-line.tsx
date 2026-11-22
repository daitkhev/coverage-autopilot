import { Box, Text } from 'ink';
import { Fragment, type ReactNode } from 'react';

import { type Fact, FactLine } from '#components/fact-line';
import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { ageWords } from '#theme/moments';
import type { GlyphName } from '#theme/symbols';

/** How fresh the last answer of the service is, at a moment. */
export interface Freshness {
  /** When the last answer came; nothing before the first one. */
  readonly answeredAt: string | undefined;
  /** The last try failed, so what the screen shows is not fresh. */
  readonly stale: boolean;
  readonly now: string;
}

interface StatusLineProps {
  /** Where the screen is: `Repositories › example/payments`. */
  readonly path: readonly string[];
  /** What the screen shows, such as `5 repositories`. */
  readonly facts: readonly string[];
  readonly freshness: Freshness;
}

const NOT_FRESH = { name: 'attention', role: 'warning' } as const;

function freshnessFact({ answeredAt, stale, now }: Freshness): Fact {
  if (answeredAt === undefined) {
    return stale
      ? { text: 'no answer yet', role: 'warning', glyph: NOT_FRESH }
      : {
          text: 'asking the service',
          role: 'running',
          glyph: { name: 'spinner', role: 'running' },
        };
  }
  const updated = `updated ${ageWords(answeredAt, now)} ago`;
  return stale
    ? { text: `not fresh, ${updated}`, role: 'warning', glyph: NOT_FRESH }
    : { text: updated };
}

function Joint({ glyph }: { readonly glyph: GlyphName }): ReactNode {
  return (
    <Text>
      {' '}
      <Glyph name={glyph} role="secondary" />{' '}
    </Text>
  );
}

function Where({
  path,
  facts,
}: Pick<StatusLineProps, 'path' | 'facts'>): ReactNode {
  return (
    <Text wrap="truncate-end">
      {path.map((part, index) => (
        <Fragment key={`path ${String(index)}`}>
          {index === 0 ? null : <Joint glyph="selected" />}
          <RoleText role="secondary">{part}</RoleText>
        </Fragment>
      ))}
      {facts.map((fact) => (
        <Fragment key={`fact ${fact}`}>
          <Joint glyph="separator" />
          <RoleText role="secondary">{fact}</RoleText>
        </Fragment>
      ))}
    </Text>
  );
}

/**
 * The status line of the footer: the path to the screen, what it shows,
 * and how fresh that is. A request that failed leaves the last answer,
 * and this line says it is not fresh. A line too long for its room is
 * cut before the freshness, so a kept answer never passes for a fresh one.
 */
export function StatusLine({
  path,
  facts,
  freshness,
}: StatusLineProps): ReactNode {
  return (
    <Box>
      <Where path={path} facts={facts} />
      <Box flexShrink={0}>
        <Joint glyph="separator" />
        <FactLine facts={[freshnessFact(freshness)]} />
      </Box>
    </Box>
  );
}
