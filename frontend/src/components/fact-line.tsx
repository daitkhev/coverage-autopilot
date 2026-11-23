import { Text } from 'ink';
import { Fragment, type ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import type { Role } from '#theme/roles';
import type { GlyphName } from '#theme/symbols';

/**
 * One fact of a line. It is secondary unless it stands out, such as
 * `outdated` in yellow, and a symbol leads it where colour alone would
 * carry its meaning.
 */
export interface Fact {
  readonly text: string;
  readonly role?: Role;
  readonly glyph?: { readonly name: GlyphName; readonly role: Role };
}

/** A fact that stands out as a warning, led by its symbol. */
export function warningFact(text: string): Fact {
  return {
    text,
    role: 'warning',
    glyph: { name: 'attention', role: 'warning' },
  };
}

interface FactLineProps {
  readonly facts: readonly Fact[];
}

function FactText({ fact }: { readonly fact: Fact }): ReactNode {
  return (
    <>
      {fact.glyph === undefined ? null : (
        <>
          <Glyph name={fact.glyph.name} role={fact.glyph.role} />{' '}
        </>
      )}
      <RoleText role={fact.role ?? 'secondary'}>{fact.text}</RoleText>
    </>
  );
}

/**
 * Facts on one line joined by a dot, such as `main · 4f2a9c1 · scanned
 * 2h ago`. A line too long for its room is cut at its end.
 */
export function FactLine({ facts }: FactLineProps): ReactNode {
  return (
    <Text wrap="truncate-end">
      {facts.map((fact, index) => (
        <Fragment key={`${String(index)} ${fact.text}`}>
          {index === 0 ? null : (
            <>
              {' '}
              <Glyph name="separator" role="secondary" />{' '}
            </>
          )}
          <FactText fact={fact} />
        </Fragment>
      ))}
    </Text>
  );
}
