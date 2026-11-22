import { Text } from 'ink';
import { Fragment, type ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';

interface StatusLineProps {
  /** Where the screen is: `Repositories › example/payments`. */
  readonly path: readonly string[];
  /** What the screen shows, such as "12 files below 80%". */
  readonly facts: readonly string[];
  /** The last try failed, so what is shown is the last answer, kept. */
  readonly stale: boolean;
}

/**
 * The status line of the footer: the path to the screen, its facts, and
 * whether what it shows is fresh. A kept answer is said in words, so it
 * never passes for a fresh one.
 */
export function StatusLine({ path, facts, stale }: StatusLineProps): ReactNode {
  return (
    <Text wrap="truncate-end">
      {path.map((part, index) => (
        <Fragment key={`path ${String(index)}`}>
          {index === 0 ? null : (
            <Text>
              {' '}
              <Glyph name="selected" role="secondary" />{' '}
            </Text>
          )}
          <RoleText role="secondary">{part}</RoleText>
        </Fragment>
      ))}
      {facts.map((fact) => (
        <Fragment key={`fact ${fact}`}>
          <Text>
            {' '}
            <Glyph name="separator" role="secondary" />{' '}
          </Text>
          <RoleText role="secondary">{fact}</RoleText>
        </Fragment>
      ))}
      {stale ? (
        <Text>
          {'  '}
          <Glyph name="attention" role="warning" />{' '}
          <RoleText role="warning">not fresh, asking again</RoleText>
        </Text>
      ) : null}
    </Text>
  );
}
