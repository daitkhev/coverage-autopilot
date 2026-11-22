import { afterEach, describe, expect, it } from 'vitest';

import type { ProjectDetection } from '#coverage/application/ports/project-detector.port';
import { NodeProjectDetector } from '#coverage/infrastructure/detection/node-project-detector.adapter';
import { pnpmLockfileOf } from '#tests/support/pnpm-lockfiles';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';
import { classicLockfileOf } from '#tests/support/yarn-lockfiles';

/** A project tested with Jest at a range of its manifest. */
function manifestOf(fields: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    name: 'widgets',
    devDependencies: { jest: '^30.5.2' },
    ...fields,
  });
}

const PNPM_FILES = {
  'package.json': manifestOf({ packageManager: 'pnpm@10.34.9' }),
  'pnpm-lock.yaml': pnpmLockfileOf({ jest: '30.5.2' }),
};

const YARN_FILES = {
  'package.json': manifestOf(),
  'yarn.lock': classicLockfileOf({ jest: '30.5.2' }),
};

const folders: ProjectFolder[] = [];

async function detect(
  files: Readonly<Record<string, string>>,
): Promise<ProjectDetection> {
  const folder = createProjectFolder(files);
  folders.push(folder);
  return new NodeProjectDetector().detect(folder.root);
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

describe('NodeProjectDetector', () => {
  describe('when the project is installed with pnpm or yarn', () => {
    it.each([
      ['pnpm', PNPM_FILES, 'pnpm@10.34.9'],
      ['yarn', YARN_FILES, 'yarn@1.22.22'],
    ])(
      'should give %s, the version its lockfile holds and its install',
      async (name, files, program) => {
        const detection = await detect(files);

        expect(detection).toMatchObject({
          outcome: 'supported',
          project: { packageManager: name, testRunnerVersion: '30.5.2' },
          parameters: { testRunnerVersion: '30.5.2' },
          install: { environment: { COREPACK_ENV_FILE: '0' } },
        });
        expect(
          detection.outcome === 'supported' &&
            detection.install.command.slice(0, 3),
        ).toEqual(['corepack', program, 'install']);
      },
    );

    it('should take a workspace file of settings alone for one package', async () => {
      const detection = await detect({
        ...PNPM_FILES,
        'pnpm-workspace.yaml': 'onlyBuiltDependencies:\n  - esbuild\n',
      });

      expect(detection.outcome).toBe('supported');
    });

    it('should say which lockfile locks no version of the runner', async () => {
      const detection = await detect({
        ...YARN_FILES,
        'yarn.lock': classicLockfileOf({ vitest: '4.1.12' }),
      });

      expect(detection).toEqual({
        outcome: 'unsupported',
        reason: 'no_lockfile',
        detail: 'yarn.lock locks no version of jest.',
      });
    });
  });
});
