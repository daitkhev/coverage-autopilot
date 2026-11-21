import { Text } from 'ink';
import type { ReactNode } from 'react';

import { RoleText } from '#components/role-text';

interface EmptyStateProps {
  /** What is missing, such as "No repositories yet." */
  readonly sentence: string;
  /** The key that changes it, and what it does: `a`, "to add one". */
  readonly keyName: string;
  readonly action: string;
}

/** One sentence and the key that changes it. */
export function EmptyState({
  sentence,
  keyName,
  action,
}: EmptyStateProps): ReactNode {
  return (
    <Text>
      <RoleText>{`${sentence} Press `}</RoleText>
      <RoleText bold>{keyName}</RoleText>
      <RoleText>{` ${action}.`}</RoleText>
    </Text>
  );
}
