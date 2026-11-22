import { Box, Text } from 'ink';
import { describe, expect, it } from 'vitest';

import { Clipped } from '#components/clipped';
import { drawnAt, USUAL_COLUMNS } from '#tests/support/terminal-text';

const ROOM = 3;

function lines(count: number): string[] {
  return Array.from({ length: count }, (_, at) => `line ${String(at + 1)}`);
}

function draw(count: number): string {
  return drawnAt(
    <Box flexDirection="column" height={ROOM + 1}>
      <Clipped>
        {lines(count).map((line) => (
          <Text key={line}>{line}</Text>
        ))}
      </Clipped>
      <Text>footer</Text>
    </Box>,
    USUAL_COLUMNS,
  );
}

describe('Clipped', () => {
  describe('when the lines fit', () => {
    it('should draw them all', () => {
      expect(draw(2)).toBe('line 1\nline 2\n\nfooter');
    });
  });

  describe('when there are more lines than room', () => {
    it('should cut them at the bottom and keep what comes after', () => {
      expect(draw(ROOM + 2)).toBe('line 1\nline 2\nline 3\nfooter');
    });
  });
});
