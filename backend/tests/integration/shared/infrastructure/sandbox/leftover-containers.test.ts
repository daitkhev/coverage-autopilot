import { afterEach, describe, expect, it, vi } from 'vitest';

import { SandboxListFailedError } from '#infrastructure/sandbox/errors/sandbox-list-failed.error';
import { removeLeftoverContainers } from '#infrastructure/sandbox/leftover-containers';
import { BENCH_INSTANCE, useSandboxBench } from '#tests/support/sandbox-bench';
import type {
  EnginePlay,
  ListedContainer,
} from '#tests/support/stand-in-engine';
import { toolLogOf } from '#tests/support/tool-lines';

const LABEL = 'coverage-autopilot.instance';
const OWN = 'coverage-autopilot-00000000-0000-4000-8000-0000000000a1';
const ALSO_OWN = 'coverage-autopilot-00000000-0000-4000-8000-0000000000a2';
const OF_ANOTHER = 'coverage-autopilot-00000000-0000-4000-8000-0000000000b1';
const NOT_SANDBOXED = 'web-server';
const SILENCE = 30_000;

const bench = useSandboxBench();

function labelled(name: string, instance = BENCH_INSTANCE): ListedContainer {
  return { name, labels: { [LABEL]: instance } };
}

async function sweptWith(
  play: EnginePlay,
): ReturnType<typeof removeLeftoverContainers> {
  return removeLeftoverContainers(bench.settings(play), toolLogOf());
}

function callArguments(): (readonly string[])[] {
  return bench.calls().map((call) => call.arguments);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('removeLeftoverContainers', () => {
  it('should remove every container of its instance and none of another', async () => {
    const sweep = await sweptWith({
      containers: [
        labelled(OWN),
        labelled(OF_ANOTHER, 'instance-of-another-bench'),
        {
          name: 'coverage-autopilot-00000000-0000-4000-8000-0000000000c1',
          labels: {},
        },
        labelled(ALSO_OWN),
      ],
    });

    const [listing, ...removals] = callArguments();
    expect(sweep).toEqual({ removed: [OWN, ALSO_OWN], left: [] });
    expect(listing).toEqual([
      'ps',
      '--all',
      '--filter',
      `label=${LABEL}=${BENCH_INSTANCE}`,
      '--format',
      '{{.Names}}',
    ]);
    expect(removals.map((removal) => removal.join(' ')).sort()).toEqual([
      `rm --force ${OWN}`,
      `rm --force ${ALSO_OWN}`,
    ]);
  });

  it('should leave alone a container of its instance that the sandbox did not name', async () => {
    const sweep = await sweptWith({ containers: [labelled(NOT_SANDBOXED)] });

    expect(sweep).toEqual({ removed: [], left: [] });
    expect(callArguments()).toHaveLength(1);
  });

  describe('when the engine does not remove a container', () => {
    it('should say which one stays and what the engine said', async () => {
      const said = 'Error response from daemon: device or resource busy';

      const sweep = await sweptWith({
        containers: [labelled(OWN)],
        removal: { exitCode: 1, output: [{ stream: 'stderr', text: said }] },
      });

      expect(sweep).toEqual({
        removed: [],
        left: [
          {
            name: OWN,
            detail: `The engine did not remove it. It said: ${said}`,
          },
        ],
      });
    });
  });

  describe('when the engine does not list the containers', () => {
    it('should throw SandboxListFailedError with what it said, and remove nothing', async () => {
      const said =
        'Cannot connect to the Docker daemon. Is the docker daemon running?';

      const sweeping = sweptWith({
        containers: [labelled(OWN)],
        listing: { exitCode: 1, output: [{ stream: 'stderr', text: said }] },
      });

      await expect(sweeping).rejects.toThrow(
        new SandboxListFailedError(
          `The engine did not list the containers of the instance. It said: ${said}`,
        ),
      );
      await expect(sweeping).rejects.toMatchObject({ retryable: true });
      expect(callArguments()).toHaveLength(1);
    });

    it('should throw SandboxListFailedError once it waited thirty seconds', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const sweeping = sweptWith({ listing: { endless: true } });
      await vi.waitFor(
        () => {
          expect(bench.calls()).toHaveLength(1);
        },
        { timeout: 10_000 },
      );
      vi.advanceTimersByTime(SILENCE);

      await expect(sweeping).rejects.toThrow(
        new SandboxListFailedError(
          'The engine did not list the containers of the instance within 30 seconds.',
        ),
      );
    });
  });
});
