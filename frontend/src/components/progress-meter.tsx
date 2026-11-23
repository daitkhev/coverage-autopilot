import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { Bar } from '#components/bar';
import { RoleText } from '#components/role-text';
import { limitRoleOf } from '#theme/bars';
import { GAP } from '#theme/widths';

interface ProgressMeterProps {
  /** A limit in use, or a run of steps such as a scan or the checks. */
  readonly kind: 'limit' | 'steps';
  readonly used: number;
  readonly total: number;
  readonly cells: number;
  /** How the numbers are written, such as `84k` of `200k`. */
  readonly usedText?: string;
  readonly totalText?: string;
}

/**
 * A limit is plain, yellow from 80% and red when it is spent. A run of
 * steps is a cyan bar with "3 of 4" beside it.
 */
export function ProgressMeter({
  kind,
  used,
  total,
  cells,
  usedText = String(used),
  totalText = String(total),
}: ProgressMeterProps): ReactNode {
  const role = kind === 'limit' ? limitRoleOf(used, total) : 'running';
  return (
    <Box flexShrink={0} gap={GAP}>
      <Bar shape={{ filled: used / total, cells }} role={role} />
      <Text>
        <RoleText bold={kind === 'limit'}>{usedText}</RoleText>
        <RoleText role="secondary">{` of ${totalText}`}</RoleText>
      </Text>
    </Box>
  );
}
