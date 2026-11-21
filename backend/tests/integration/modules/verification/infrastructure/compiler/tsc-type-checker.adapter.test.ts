import { rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type InMemoryArtifacts,
  inMemoryArtifacts,
} from '#tests/support/coverage-stand-ins';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';
import { PASSED, RecordingSandbox } from '#tests/support/recording-sandbox';
import { VERIFICATION_TEST_SETTINGS } from '#tests/support/verification-stand-ins';
import type { TypeCheckResult } from '#verification/application/ports/type-checker.port';
import { TscTypeChecker } from '#verification/infrastructure/compiler/tsc-type-checker.adapter';

const COMPILER = 'node_modules/typescript/bin/tsc';

let folder: ProjectFolder;
let sandbox: RecordingSandbox;
let artifacts: InMemoryArtifacts;

async function check(
  signal = new AbortController().signal,
): Promise<TypeCheckResult> {
  const checker = new TscTypeChecker(
    sandbox,
    artifacts,
    VERIFICATION_TEST_SETTINGS,
  );
  return checker.check(
    { workingCopyPath: folder.root, owner: 'improvement:7', timeoutMs: 60_000 },
    signal,
  );
}

describe('TscTypeChecker', () => {
  beforeEach(() => {
    folder = createProjectFolder({
      'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
      [COMPILER]: "#!/usr/bin/env node\nrequire('../lib/tsc.js');\n",
    });
    sandbox = new RecordingSandbox();
    artifacts = inMemoryArtifacts();
  });

  afterEach(() => {
    folder.remove();
  });

  describe('check', () => {
    it('should run the compiler of the project in the sandbox, with no network', async () => {
      const result = await check();

      expect(sandbox.requests).toEqual([
        {
          workingCopyPath: folder.root,
          command: [
            'node',
            COMPILER,
            '--noEmit',
            '--pretty',
            'false',
            '--project',
            'tsconfig.json',
          ],
          environment: VERIFICATION_TEST_SETTINGS.commandEnvironment,
          network: 'none',
          timeoutMs: 60_000,
        },
      ]);
      expect(result).toEqual({
        outcome: 'passes',
        durationMs: PASSED.durationMs,
        outputReference: 'artifact-1',
      });
    });

    it('should keep the output of the compiler under the owner', async () => {
      sandbox.answer({
        ...PASSED,
        exitCode: 2,
        output:
          "src/a.test.ts(1,7): error TS2322: Type 'string' is not 'number'.",
      });

      const result = await check();

      expect(result.outcome).toBe('fails');
      expect(artifacts.saved).toEqual([
        {
          owner: 'improvement:7',
          label: 'type-check',
          content:
            "src/a.test.ts(1,7): error TS2322: Type 'string' is not 'number'.",
        },
      ]);
    });

    describe('when the compiler runs out of time', () => {
      it('should answer timed_out', async () => {
        sandbox.answer({ ...PASSED, outcome: 'timed_out', exitCode: null });

        expect((await check()).outcome).toBe('timed_out');
      });
    });

    describe('when the project has no compiler or no configuration', () => {
      it('should answer absent and run nothing', async () => {
        rmSync(join(folder.root, 'node_modules'), { recursive: true });
        const noCompiler = await check();
        folder.write(COMPILER, '');
        rmSync(join(folder.root, 'tsconfig.json'));
        const noConfiguration = await check();

        expect(noCompiler).toEqual({ outcome: 'absent' });
        expect(noConfiguration).toEqual({ outcome: 'absent' });
        expect(sandbox.requests).toEqual([]);
      });
    });

    describe('when the configuration is a link', () => {
      it('should leave it to the compiler in the sandbox', async () => {
        rmSync(join(folder.root, 'tsconfig.json'));
        folder.write('tsconfig.base.json', '{}');
        symlinkSync('tsconfig.base.json', join(folder.root, 'tsconfig.json'));

        expect((await check()).outcome).toBe('passes');
        expect(sandbox.requests).toHaveLength(1);
      });
    });

    describe('when the signal is aborted', () => {
      it('should throw and keep no output', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(check(controller.signal)).rejects.toThrow();
        expect(artifacts.saved).toEqual([]);
      });
    });
  });
});
