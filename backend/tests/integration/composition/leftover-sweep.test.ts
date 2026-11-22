import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ServiceRun } from '#composition/service-run';
import type { RunningService } from '#infrastructure/service/running-service';
import {
  askedScan,
  type HostedService,
  hostedService,
  onEngine,
  WORK_WAIT,
} from '#tests/support/hosted-service';
import {
  giveBackFolders,
  lockFolder,
  plantLockedTree,
  plantOutside,
} from '#tests/support/locked-tree';
import {
  askOver,
  type ServiceBench,
  serviceBench,
} from '#tests/support/service-bench';
import {
  callsIn,
  type EnginePlay,
  standInEngine,
} from '#tests/support/stand-in-engine';

const LABEL = 'coverage-autopilot.instance';
const OWN = 'coverage-autopilot-00000000-0000-4000-8000-0000000000a1';
const OF_ANOTHER = 'coverage-autopilot-00000000-0000-4000-8000-0000000000b1';

/** The folder of the copy a crashed scan left, and its git directory. */
const LEFT_COPY = 'snapshot_3ascan_3a1';

const SWEPT = 'The start removed what a stopped service left.';

let bench: ServiceBench | undefined;
let hosted: HostedService | undefined;

afterEach(async () => {
  for (const each of [bench, hosted?.bench]) {
    if (each !== undefined) {
      giveBackFolders(dirname(each.config.instance.directory));
    }
  }
  await bench?.close();
  await hosted?.close();
  bench = undefined;
  hosted = undefined;
});

function running(run: ServiceRun): RunningService {
  if (run.outcome !== 'running') {
    throw new Error(`The service did not run: ${run.outcome}.`);
  }
  return run.service;
}

/** Where the stand-in of a bench records its calls, beside the instance. */
function recordOf(of: ServiceBench): string {
  return join(dirname(of.config.instance.directory), 'engine.jsonl');
}

/** A bench whose engine plays what `playOf` makes of its instance. */
function benchPlaying(playOf: (instance: string) => EnginePlay): ServiceBench {
  return serviceBench({}, (config) => {
    const record = join(dirname(config.instance.directory), 'engine.jsonl');
    const play = playOf(config.sandbox.instance);
    return onEngine(config, standInEngine(record, play));
  });
}

/**
 * What a service killed in a scan leaves in its working copies: a tree
 * its sandbox locked, with links out of it, its git directory, and the
 * mirror of the repository, which is no leftover. Gives the tree.
 */
function leftCopyIn(of: ServiceBench): string {
  const root = of.config.instance.workingCopies;
  const outside = join(dirname(of.config.instance.directory), 'outside');
  plantOutside(outside);
  const tree = join(root, 'copies', LEFT_COPY);
  mkdirSync(tree, { recursive: true });
  plantLockedTree(tree, outside);
  mkdirSync(join(root, 'git-dirs', LEFT_COPY, 'objects'), { recursive: true });
  mkdirSync(join(root, 'mirrors', 'widgets.git'), { recursive: true });
  return tree;
}

describe('sweepLeftovers', () => {
  describe('when a service of the instance stopped without its clean stop', () => {
    it('should remove its containers and its working copies, and nothing of another instance', async () => {
      bench = benchPlaying((instance) => ({
        containers: [
          { name: OWN, labels: { [LABEL]: instance } },
          { name: OF_ANOTHER, labels: { [LABEL]: 'f'.repeat(64) } },
        ],
      }));
      const tree = leftCopyIn(bench);
      const root = bench.config.instance.workingCopies;

      running(await bench.run());

      const removals = callsIn(recordOf(bench))
        .map((call) => call.arguments)
        .filter((args) => args[0] === 'rm');
      expect(removals).toEqual([['rm', '--force', OWN]]);
      expect(existsSync(tree)).toBe(false);
      expect(readdirSync(join(root, 'git-dirs'))).toEqual([]);
      expect(readdirSync(join(root, 'mirrors'))).toEqual(['widgets.git']);
      expect(bench.logLines()).toContainEqual(
        expect.objectContaining({
          level: 'info',
          message: SWEPT,
          fields: { component: 'start-sweep', containers: 1, workingCopies: 1 },
        }),
      );
    });
  });

  describe('when the sweep fails', () => {
    it('should say so in the log and start all the same', async () => {
      const said = 'Cannot connect to the Docker daemon.';
      bench = benchPlaying(() => ({
        listing: { exitCode: 1, output: [{ stream: 'stderr', text: said }] },
      }));
      const tree = leftCopyIn(bench);
      lockFolder(dirname(tree));

      running(await bench.run());

      const answer = await askOver(bench.config.instance.socket, '/nowhere');
      expect(answer.status).toBe(404);
      expect(existsSync(tree)).toBe(true);
      expect(
        bench
          .logLines()
          .filter((line) => line.fields['component'] === 'start-sweep')
          .map((line) => [line.level, line.message, line.fields['errorCode']]),
      ).toEqual([
        [
          'warn',
          'The containers a stopped service left could not be listed, so ' +
            'none was removed.',
          'sandbox_list_failed',
        ],
        [
          'warn',
          'A working copy a stopped service left could not be removed.',
          'working_copy_not_removed',
        ],
      ]);
    });
  });

  describe('when the worker takes back a job the stopped service ran', () => {
    it('should be done before the job runs again, and leave the copy the job makes anew', async () => {
      hosted = hostedService({ endless: true });
      const first = running(await hosted.bench.run());
      await askedScan(hosted);
      const runs = (): string[][] =>
        (hosted?.engineCalls() ?? [])
          .map((call) => [...call.arguments])
          .filter((args) => args[0] === 'run');
      await expect.poll(() => runs().length, WORK_WAIT).toBe(1);
      const [args = []] = runs();
      const copy = args[args.indexOf('--workdir') + 1] ?? '';
      await first.stop();
      mkdirSync(copy, { recursive: true });
      writeFileSync(join(copy, 'left-by-the-stop.txt'), 'x');

      running(await hosted.bench.run());
      await expect.poll(() => runs().length, WORK_WAIT).toBe(2);

      expect(existsSync(copy)).toBe(true);
      expect(existsSync(join(copy, 'left-by-the-stop.txt'))).toBe(false);
      const verbs = hosted.engineCalls().map((call) => call.arguments[0]);
      expect(verbs.lastIndexOf('ps')).toBeLessThan(verbs.lastIndexOf('run'));
      const messages = hosted.bench.logLines().map((line) => line.message);
      expect(messages.indexOf(SWEPT)).toBeGreaterThan(-1);
      expect(messages.indexOf(SWEPT)).toBeLessThan(
        messages.lastIndexOf('A job started.'),
      );
    });
  });
});
