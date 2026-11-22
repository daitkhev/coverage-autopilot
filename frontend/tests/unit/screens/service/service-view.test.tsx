import { afterAll, describe, expect, it, vi } from 'vitest';

import type { Health } from '@coverage-autopilot/api-contracts/health';

import type { Problem } from '#components/problem-details';
import type { DatedRequest } from '#hooks/use-dated-request';
import type { Restart } from '#screens/service/restart';
import { ServiceView } from '#screens/service/service-view';
import { refused, SAMPLE_NOW } from '#tests/support/fake-service-api';
import { sampleFrame, SECTION, WIDE } from '#tests/support/sample-frame';
import { BUSY_HEALTH, IDLE_HEALTH } from '#tests/support/sample-repositories';
import {
  drawnAt,
  drawnWith,
  plainText,
  styledAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';

/** Colour is forced on, so turning it off in the theme is what removes it. */
vi.hoisted(() => {
  vi.stubEnv('FORCE_COLOR', '1');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const ESCAPE = '\u001B';
const COLOUR_CODE = new RegExp(`${ESCAPE}\\[(3[0-9]|9[0-7])m`, 'u');
const SECOND_AGO = '2026-11-21T14:04:59.000Z';

function answered(health: Health): DatedRequest<Health> {
  return {
    answer: health,
    answeredAt: SECOND_AGO,
    stale: false,
    failure: undefined,
  };
}

function view({
  health = answered(IDLE_HEALTH),
  problem,
  restart = { phase: 'idle' },
  columns = USUAL_COLUMNS,
  focused = 'status',
}: {
  readonly health?: DatedRequest<Health>;
  readonly problem?: Problem;
  readonly restart?: Restart;
  readonly columns?: number;
  readonly focused?: 'status' | 'storage';
}): string {
  return drawnAt(
    <ServiceView
      frame={sampleFrame({ ...WIDE, columns }, SECTION.service)}
      health={health}
      problem={problem}
      moment={{ now: SAMPLE_NOW, timeZone: 'UTC' }}
      focused={focused}
      restart={restart}
    />,
    columns,
  );
}

describe('ServiceView', () => {
  it('should say whether everything is in order', () => {
    expect(view({})).toMatchSnapshot();
  });

  describe('when no answer came yet', () => {
    it('should draw the panels empty and say it asks the service', () => {
      expect(
        view({
          health: {
            answer: undefined,
            answeredAt: undefined,
            stale: false,
            failure: undefined,
          },
        }),
      ).toMatchSnapshot();
    });
  });

  describe('when the last request failed', () => {
    it('should keep the last health and say it is not fresh', () => {
      const drawn = view({
        health: { ...answered(IDLE_HEALTH), stale: true },
      });

      expect(drawn).toMatchSnapshot();
    });

    it('should show a fault that is not a service that is down', () => {
      const drawn = view({
        health: { ...answered(IDLE_HEALTH), stale: true },
        problem: {
          kind: 'fault',
          fault: new TypeError('The answer does not match its schema.'),
        },
      });

      expect(drawn).toContain('THE CLIENT SAID');
      expect(drawn).toContain('The answer does not match its schema.');
    });
  });

  describe('when the health does not know a part yet', () => {
    it('should say it is not known and make nothing up', () => {
      const drawn = view({
        health: answered({
          ...IDLE_HEALTH,
          githubAccount: null,
          tools: [],
          generator: { ...IDLE_HEALTH.generator, limits: null },
        }),
      });

      expect(drawn).toMatch(/Tools +– not known yet/u);
      expect(drawn).toMatch(/Code host +– not known yet/u);
      expect(drawn).toMatch(/Limits +– not known yet/u);
      expect(drawn).toMatch(/Data +– not known yet/u);
    });
  });

  describe('when the service is not in order', () => {
    it('should say that the worker has stopped', () => {
      const drawn = view({
        health: answered({
          ...IDLE_HEALTH,
          worker: { alive: false, lastSeenAt: null },
        }),
      });

      expect(drawn).toContain('! The worker has stopped');
      expect(drawn).toMatch(/Worker +! stopped, last sign not known yet/u);
    });

    it('should say that the service is not ready', () => {
      const drawn = view({
        health: answered({ ...IDLE_HEALTH, ready: false }),
      });

      expect(drawn).toContain('! The service is not ready');
      expect(drawn).toMatch(/Service +starting, started 3h 12m ago/u);
    });
  });

  describe('when work runs', () => {
    it('should offer no restart and say when it can be', () => {
      const drawn = view({ health: answered(BUSY_HEALTH) });

      expect(drawn).toContain('r restart  after the running work ends');
      expect(drawn).not.toMatch(/tab other panel +r restart/u);
    });
  });

  describe('when the service is asked to stop', () => {
    it.each<readonly [string, Restart, string]>([
      ['asked', { phase: 'running' }, 'Asking the service to stop.'],
      [
        'stopping',
        {
          phase: 'ended',
          outcome: {
            outcome: 'answered',
            status: 202,
            value: { stopping: true },
          },
        },
        'The service stops, and starts again with the next request.',
      ],
      [
        'refused',
        {
          phase: 'ended',
          outcome: refused(409, {
            error: 'status_conflict',
            message: 'A scan runs, so the service does not stop.',
          }),
        },
        'A scan runs, so the service does not stop.',
      ],
      [
        'unreachable',
        { phase: 'failed', failure: new Error('Nothing answers.') },
        'The service was not stopped: Nothing answers.',
      ],
      [
        'failed with a text',
        { phase: 'failed', failure: 'socket closed' },
        'The service was not stopped: socket closed',
      ],
    ])('should say what happened when %s', (_case, restart, notice) => {
      expect(view({ restart })).toContain(notice);
    });

    it('should offer no second restart while it is asked', () => {
      expect(view({ restart: { phase: 'running' } })).toContain(
        'r restart  it is being stopped',
      );
    });
  });

  describe('when the window has room for one panel', () => {
    it('should show the panel with the focus', () => {
      const drawn = view({ columns: 80, focused: 'storage' });

      expect(drawn).toContain('Storage and actions');
      expect(drawn).not.toContain('ENVIRONMENT');
    });
  });

  describe('when colour is turned off', () => {
    it('should still show every state as a symbol and a word', () => {
      const styled = styledAt(
        drawnWith(
          { colour: false },
          <ServiceView
            frame={sampleFrame(WIDE, SECTION.service)}
            health={answered(IDLE_HEALTH)}
            problem={undefined}
            moment={{ now: SAMPLE_NOW, timeZone: 'UTC' }}
            focused="status"
            restart={{ phase: 'idle' }}
          />,
        ),
        USUAL_COLUMNS,
      );

      expect(styled).not.toMatch(COLOUR_CODE);
      expect(plainText(styled)).toContain('● Everything is in order');
      expect(plainText(styled)).toContain('✓ git 2.47.1');
      expect(plainText(styled)).toContain('– not known yet');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const drawn = view({
      columns,
      health: { ...answered(BUSY_HEALTH), stale: true },
      problem: { kind: 'fault', fault: new Error('x'.repeat(300)) },
    });

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
  });
});
