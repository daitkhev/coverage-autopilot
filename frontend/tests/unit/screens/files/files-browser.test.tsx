import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { ServiceApi } from '#api/service-api';
import { FilesBrowser } from '#screens/files/files-browser';
import { answered, fakeSession } from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { PAYMENTS_FILES } from '#tests/support/sample-files';
import {
  FRESH_ANSWER,
  NARROW,
  sampleFrame,
  SECTION,
  WIDE,
} from '#tests/support/sample-frame';
import {
  ACCESS_PASSED,
  BUDGET_SETTINGS,
  PAYMENTS_SNAPSHOT,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { screenLog } from '#tests/support/sample-work-log';
import { drawnWith } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';
import type { TerminalSize } from '#theme/widths';

/** What the dialog that starts an improvement asks first. */
const PREFLIGHT: Partial<ServiceApi> = {
  getBudgetSettings: () => Promise.resolve(answered(BUDGET_SETTINGS)),
  checkAccess: () => Promise.resolve(answered(ACCESS_PASSED)),
};

function browsing(
  scripted: Partial<ServiceApi> = PREFLIGHT,
  size: TerminalSize = WIDE,
): {
  readonly terminal: ReturnType<typeof renderAt>;
  readonly log: string[];
} {
  const noted = screenLog();
  const frame = sampleFrame(size, SECTION.repositories, {
    q: () => {
      noted.log.push('quit');
    },
  });
  const browser = (
    <FilesBrowser
      session={fakeSession(scripted)}
      frame={frame}
      repository={SCANNED_REPOSITORY}
      snapshot={PAYMENTS_SNAPSHOT}
      files={PAYMENTS_FILES}
      freshness={FRESH_ANSWER}
      onOpenImprovement={noted.onOpenImprovement}
      onBack={noted.onBack}
    />
  );
  const tree = <>{drawnWith({ animation: false }, browser)}</>;
  return { terminal: renderAt(tree, size), log: noted.log };
}

/** The lines of the frame that name a file. */
function rowsNaming(frame: string, path: string): string[] {
  return frame.split('\n').filter((line) => line.includes(`${path} `));
}

afterEach(cleanup);

describe('FilesBrowser', () => {
  it('should move the chosen row and show it on the right', async () => {
    const { terminal } = browsing();

    await press(terminal, KEYS.down);

    expect(frameOf(terminal)).toContain('row 2 of 2');
    expect(frameOf(terminal)).toContain('╭─ src/billing/sum.ts');

    await press(terminal, 'k', 'G', 'g', 'j');
    expect(frameOf(terminal)).toContain('row 2 of 2');
  });

  describe('when another list is chosen', () => {
    it('should show every file, the ones without numbers never as a percentage', async () => {
      const { terminal } = browsing(PREFLIGHT, NARROW);

      await press(terminal, ']');

      const frame = frameOf(terminal);
      expect(frame).toContain('All 7');
      expect(frame).toContain('row 1 of 7');
      for (const path of ['src/legacy/parser.ts', 'src/billing/types.ts']) {
        expect(rowsNaming(frame, path)).toHaveLength(1);
        expect(rowsNaming(frame, path).join('')).not.toContain('%');
      }
      expect(rowsNaming(frame, 'src/legacy/parser.ts').join('')).toContain(
        'N/A  has a syntax error',
      );
    });

    it('should explain a file that could not be measured', async () => {
      const { terminal } = browsing();

      await press(terminal, '[', '[');

      expect(frameOf(terminal)).toMatchSnapshot();
    });

    it('should say that a file has no code', async () => {
      const { terminal } = browsing();

      await press(terminal, '[');

      expect(frameOf(terminal)).toContain('0/0  no code');
      expect(frameOf(terminal)).toContain('i improve  no code to test');
      expect(frameOf(terminal)).not.toContain('i improve this file');
    });

    it('should come back to the first list after the last', async () => {
      const { terminal } = browsing();

      await press(terminal, ']', ']', ']', ']');

      expect(frameOf(terminal)).toContain('2 files below the threshold');
    });
  });

  describe('when the list is filtered', () => {
    it('should keep the files whose path holds the text', async () => {
      const { terminal, log } = browsing();

      await press(terminal, '/', 'S', 'U', 'M', 'q');
      expect(frameOf(terminal)).toContain('/ SUMq█');
      expect(log).toEqual([]);

      await press(terminal, KEYS.backspace, KEYS.enter);
      const frame = frameOf(terminal);
      expect(frame).toContain('1 file below the threshold · holding "SUM"');
      expect(rowsNaming(frame, 'src/billing/invoice.ts')).toEqual([]);
    });

    it('should say how to change a filter that holds no file', async () => {
      const { terminal } = browsing();

      await press(terminal, '/', 'x', 'y', KEYS.enter);

      expect(frameOf(terminal)).toContain(
        'No file of this list holds "xy". Press / to change the filter.',
      );
      expect(frameOf(terminal)).not.toContain('row 1');
    });

    it('should throw the text away on esc', async () => {
      const { terminal } = browsing();

      await press(terminal, '/', 'x', KEYS.escape);

      expect(frameOf(terminal)).toContain('2 files below the threshold');
      expect(frameOf(terminal)).not.toContain('holding');
    });
  });

  describe('when enter is pressed', () => {
    it('should open the work of a file that has some', async () => {
      const { terminal, log } = browsing();

      await press(terminal, KEYS.enter, KEYS.down, KEYS.enter);

      expect(log).toEqual(['open improvement-sum']);
    });
  });

  describe('when the details have the focus', () => {
    it('should keep the list where it is and offer the way back', async () => {
      const { terminal } = browsing();

      await press(terminal, KEYS.tab, KEYS.down);

      expect(frameOf(terminal)).toContain('row 1 of 2');
      expect(frameOf(terminal)).toContain('tab list');

      await press(terminal, KEYS.tab, KEYS.down);
      expect(frameOf(terminal)).toContain('row 2 of 2');
    });
  });

  describe('when i is pressed', () => {
    it('should open the dialog over the screen, which takes every key', async () => {
      const { terminal } = browsing();

      await press(terminal, 'i');
      await expect.poll(() => frameOf(terminal), PATIENT).toContain('Attempts');
      expect(frameOf(terminal)).toMatchSnapshot();

      await press(terminal, ']', 'q', KEYS.escape);
      expect(frameOf(terminal)).not.toContain('Attempts');
      expect(frameOf(terminal)).toContain('2 files below the threshold');
    });

    it('should open nothing for a file without numbers', async () => {
      const { terminal } = browsing();

      await press(terminal, '[', '[', 'i');

      expect(frameOf(terminal)).not.toContain('Improve src/legacy/parser.ts');
    });
  });
});
