import { describe, expect, it, vi } from 'vitest';

import {
  ConnectDialogView,
  connectHintsOf,
  connectStatusOf,
} from '#screens/repositories/connect-dialog-view';
import type { ConnectPhase } from '#screens/repositories/connect-flow';
import { SAMPLE_NOW } from '#tests/support/fake-service-api';
import {
  ACCESS_REFUSED,
  NEVER_SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

const ADDRESS = 'https://github.com/example/notifier';

const CHECKING: ConnectPhase = {
  step: 'checking',
  since: '2026-11-21T14:04:57.000Z',
  repository: NEVER_SCANNED_REPOSITORY,
};

const ACCESS: ConnectPhase = {
  step: 'refused',
  refusal: {
    kind: 'access',
    repository: NEVER_SCANNED_REPOSITORY,
    check: ACCESS_REFUSED,
  },
};

const NOT_FOUND: ConnectPhase = {
  step: 'refused',
  refusal: {
    kind: 'refused',
    status: 404,
    error: {
      error: 'not_found',
      message: 'No repository was found at this address.',
    },
  },
};

const FAULT: ConnectPhase = {
  step: 'refused',
  refusal: { kind: 'fault', fault: new TypeError('Broken.') },
};

function draw(phase: ConnectPhase, columns = USUAL_COLUMNS): string {
  return drawnAt(
    <ConnectDialogView
      state={{ id: 1, url: ADDRESS, phase }}
      now={SAMPLE_NOW}
      onChange={vi.fn()}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
    />,
    columns,
  );
}

describe('ConnectDialogView', () => {
  it('should show the step that runs and the time it took', () => {
    const drawn = draw(CHECKING);

    expect(drawn).toMatch(/Checking access +3s/u);
    expect(drawn).toContain('the right to push to');
    expect(drawn).toContain('esc close');
    expect(drawn).not.toContain('enter');
  });

  it('should say it reads the repository first', () => {
    expect(draw({ step: 'connecting', since: SAMPLE_NOW })).toMatch(
      /Reading the repository +0\.0s/u,
    );
  });

  it('should list the steps of a refused check, each with its symbol', () => {
    const drawn = draw(ACCESS);

    expect(drawn).toContain('✓ git installed');
    expect(drawn).toContain('✕ gh signed in');
    expect(drawn).toContain('– push access not checked');
    expect(drawn).toContain('It is connected, and no work starts');
  });

  it('should say what the service refused the address with', () => {
    const drawn = draw(NOT_FOUND);

    expect(drawn).toContain('Not connected');
    expect(drawn).toContain('not_found');
    expect(drawn).toContain('Check the address');
  });

  it('should show a fault of the request', () => {
    const drawn = draw(FAULT);

    expect(drawn).toContain('THE CLIENT SAID');
    expect(drawn).toContain('Press enter to try again.');
  });

  it.each(WIDTHS)('should fit a refused check in %i columns', (columns) => {
    expect(widestLine(draw(ACCESS, columns))).toBeLessThanOrEqual(columns);
  });
});

describe('connectStatusOf', () => {
  it.each([
    { phase: { step: 'editing' }, words: 'type the address of a repository' },
    {
      phase: { step: 'connecting', since: SAMPLE_NOW },
      words: `reading ${ADDRESS}`,
    },
    { phase: CHECKING, words: 'checking access to example/notifier' },
    { phase: ACCESS, words: 'access to example/notifier was refused' },
    { phase: NOT_FOUND, words: `${ADDRESS} was not connected` },
  ] satisfies readonly { phase: ConnectPhase; words: string }[])(
    'should say where $phase.step stands',
    ({ phase, words }) => {
      expect(connectStatusOf({ id: 1, url: ADDRESS, phase })).toBe(words);
    },
  );
});

describe('connectHintsOf', () => {
  it('should offer enter only when an address can be sent', () => {
    expect(connectHintsOf(CHECKING).map((hint) => hint.key)).toEqual(['esc']);
    expect(connectHintsOf(FAULT).map((hint) => hint.label)).toEqual([
      'check again',
      'close',
    ]);
  });
});
