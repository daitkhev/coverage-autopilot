import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { SERVICE_STATE, type ServiceState } from '#theme/status';
import { GAP, KEY_GAP, type Layout } from '#theme/widths';

/** What waits for the user: the count, and what to do with it. */
interface Waiting {
  readonly count: number;
  readonly label: string;
}

interface TabBarProps {
  readonly title: string;
  readonly sections: readonly string[];
  readonly active: number;
  /** Absent when nothing waits, so the header then carries no number. */
  readonly waiting?: Waiting;
  readonly service: ServiceState;
  readonly layout: Layout;
}

function Section({
  name,
  active,
}: {
  readonly name: string;
  readonly active: boolean;
}): ReactNode {
  return active ? (
    <Text underline>
      <RoleText role="accent" bold>
        {name}
      </RoleText>
    </Text>
  ) : (
    <RoleText>{name}</RoleText>
  );
}

/**
 * The name of the tool, the three sections, what waits for the user and
 * the state of the service. Below the wide layout the label of what waits
 * is left out and only its count stays.
 */
export function TabBar({
  title,
  sections,
  active,
  waiting,
  service,
  layout,
}: TabBarProps): ReactNode {
  const roomy = layout === 'wide' || layout === 'compact';
  const look = SERVICE_STATE[service];
  return (
    <Box gap={GAP}>
      <Box gap={roomy ? KEY_GAP : GAP} flexGrow={1}>
        <RoleText role="emphasis">{title}</RoleText>
        {sections.map((name, index) => (
          <Section key={name} name={name} active={index === active} />
        ))}
      </Box>
      {waiting === undefined ? null : (
        <Text>
          <Glyph name="waiting" role="accent" />
          <RoleText role="accent">
            {` ${String(waiting.count)}${roomy ? ` ${waiting.label}` : ''}`}
          </RoleText>
        </Text>
      )}
      <Text>
        <Glyph name={look.glyph} role={look.role} />{' '}
        <RoleText>{look.word}</RoleText>
      </Text>
    </Box>
  );
}
