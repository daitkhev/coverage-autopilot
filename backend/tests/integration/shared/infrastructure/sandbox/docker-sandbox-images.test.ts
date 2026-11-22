import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BUILT_IMAGE,
  commandRequest,
  FIRST_CONTAINER,
  MISSING_IMAGE,
  useSandboxBench,
} from '#tests/support/sandbox-bench';
import {
  SHIPPED_IMAGE_FILE,
  shippedImageLabel,
} from '#tests/support/shipped-image';

const LABEL = 'coverage-autopilot.build-file-sha256';

const bench = useSandboxBench();

function callOf(verb: string): readonly string[] {
  return (
    bench.calls().find((call) => call.arguments[0] === verb)?.arguments ?? []
  );
}

describe('DockerSandbox', () => {
  describe('before its first command', () => {
    it('should ask the engine for the label of the file of its image', async () => {
      await bench.runOn(bench.settings());

      expect(callOf('image')).toEqual([
        'image',
        'inspect',
        '--format',
        `{{ index .Config.Labels "${LABEL}" }}`,
        'sandbox-image:1',
      ]);
    });

    it('should ask once, and not again for a later command', async () => {
      const sandbox = bench.sandbox(bench.settings());

      for (const network of ['none', 'open'] as const) {
        await sandbox.run(
          commandRequest({ network }),
          new AbortController().signal,
        );
      }

      expect(bench.verbs()).toEqual(['image', 'run', 'rm', 'run', 'rm']);
    });
  });

  describe('when the engine has the image it builds, from the same file', () => {
    it('should run the command and build nothing', async () => {
      const result = await bench.runOn(bench.builtSettings());

      expect(result.outcome).toBe('exited');
      expect(bench.verbs()).toEqual(['image', 'run', 'rm']);
    });
  });

  describe('when the engine lacks the image it builds', () => {
    it('should build it from its file with the label of the file, then run with no pull', async () => {
      const settings = bench.builtSettings({ inspection: MISSING_IMAGE });

      await bench.runOn(settings);

      const build = callOf('build');
      expect(bench.verbs()).toEqual(['image', 'build', 'run', 'rm']);
      expect(build.slice(0, -1)).toEqual([
        'build',
        '--tag',
        BUILT_IMAGE,
        '--label',
        `${LABEL}=${shippedImageLabel()}`,
        '--file',
        SHIPPED_IMAGE_FILE,
      ]);
      expect(callOf('run').slice(0, 4)).toEqual([
        'run',
        '--name',
        FIRST_CONTAINER,
        '--pull=never',
      ]);
      expect(callOf('run')).toContain(BUILT_IMAGE);
    });

    it('should give the engine an empty folder of its own beside the file, and remove it after', async () => {
      await bench.runOn(bench.builtSettings({ inspection: MISSING_IMAGE }));

      const [buildCall] = bench
        .calls()
        .filter((call) => call.arguments[0] === 'build');
      const context = buildCall?.arguments.at(-1) ?? '';
      expect(buildCall?.context).toEqual([]);
      expect(context).not.toBe(dirname(SHIPPED_IMAGE_FILE));
      expect(existsSync(context)).toBe(false);
    });
  });

  describe('when the engine has the image it builds, from another file', () => {
    it.each([
      ['another label', `${'f'.repeat(64)}\n`],
      ['no label', '\n'],
    ])('should build it again for %s', async (_case, said) => {
      const inspection = {
        output: [{ stream: 'stdout', text: said }],
      } as const;

      await bench.runOn(bench.builtSettings({ inspection }));

      expect(bench.verbs()).toEqual(['image', 'build', 'run', 'rm']);
    });
  });

  describe('when the engine lacks an image it does not build', () => {
    it('should pull it, and never build it', async () => {
      await bench.runOn(bench.settings({ inspection: MISSING_IMAGE }));

      expect(bench.verbs()).toEqual(['image', 'pull', 'run', 'rm']);
      expect(callOf('pull')).toEqual(['pull', 'sandbox-image:1']);
    });
  });

  describe('when the engine has an image it does not build', () => {
    it('should take it whatever its label', async () => {
      const inspection = {
        output: [{ stream: 'stdout', text: '\n' }],
      } as const;

      await bench.runOn(bench.settings({ inspection }));

      expect(bench.verbs()).toEqual(['image', 'run', 'rm']);
    });
  });
});
