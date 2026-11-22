import type { ReactNode } from 'react';

import { type Fact, FactLine } from '#components/fact-line';
import { ageWords } from '#theme/moments';

/** How fresh the last answer of the service is, at a moment. */
export interface Freshness {
  /** When the last answer came; nothing before the first one. */
  readonly answeredAt: string | undefined;
  /** The last try failed, so what the screen shows is not fresh. */
  readonly stale: boolean;
  readonly now: string;
}

interface StatusLineProps {
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

/**
 * The status line of a screen: what it shows, and how fresh that is. A
 * request that failed leaves the last answer, and this line says it is
 * not fresh.
 */
export function StatusLine({ facts, freshness }: StatusLineProps): ReactNode {
  return (
    <FactLine
      facts={[...facts.map((text) => ({ text })), freshnessFact(freshness)]}
    />
  );
}
