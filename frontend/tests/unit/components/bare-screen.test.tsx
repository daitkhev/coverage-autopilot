import { Text } from 'ink';
import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import { BareScreen } from '#components/bare-screen';
import { KEYS, press } from '#tests/support/keys';
import { NARROW, sampleFrame } from '#tests/support/sample-work-frame';
import { drawnWith } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';

function shown(stale: { readonly stale: boolean }) {
  const log: string[] = [];
  const screen = (
    <BareScreen
      frame={sampleFrame(NARROW)}
      path={['Improvements', 'example/payments']}
      body={<Text>Nothing to show</Text>}
      stale={stale.stale}
      onBack={() => {
        log.push('back');
      }}
    />
  );
  const tree = <>{drawnWith({ animation: false }, screen)}</>;
  return { terminal: renderAt(tree, NARROW), log };
}

afterEach(cleanup);

describe('BareScreen', () => {
  it('should draw its body, its path and the way back', async () => {
    const { terminal, log } = shown({ stale: false });

    expect(frameOf(terminal)).toContain('Nothing to show');
    expect(frameOf(terminal)).toContain('Improvements › example/payments');
    expect(frameOf(terminal)).toContain('esc back');

    await press(terminal, KEYS.escape);
    expect(log).toEqual(['back']);
  });

  describe('when the last try failed', () => {
    it('should say that the body is not fresh', () => {
      const { terminal } = shown({ stale: true });

      expect(frameOf(terminal)).toContain('not fresh, asking again');
    });
  });
});
