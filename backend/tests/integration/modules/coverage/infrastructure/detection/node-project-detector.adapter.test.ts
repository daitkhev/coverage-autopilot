import { symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ProjectDetection } from '#coverage/application/ports/project-detector.port';
import { DetectedProject } from '#coverage/domain/value-objects/detected-project.vo';
import { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import { NodeProjectDetector } from '#coverage/infrastructure/detection/node-project-detector.adapter';
import { FilePath } from '#kernel/primitives/file-path';
import { pnpmLockfileOf } from '#tests/support/pnpm-lockfiles';
import {
  createProjectFolder,
  lockfileOf,
  type ProjectFolder,
} from '#tests/support/project-folder';

const SOURCE = 'export const one = 1;\n';

/** The four files of the fixture projects, and tests beside them. */
const SOURCES = {
  'src/used.ts': SOURCE,
  'src/unused.ts': SOURCE,
  'src/types.ts': 'export interface Pair { readonly left: number }\n',
  'src/broken.ts': 'export function broken(: number {\n',
  'tests/used.test.ts': SOURCE,
};

const JEST_LOCK = lockfileOf({ jest: '30.5.2' });

function manifest(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ name: 'widgets', private: true, ...fields });
}

function jestManifest(fields: Readonly<Record<string, unknown>> = {}): string {
  return manifest({ devDependencies: { jest: '^30.5.2' }, ...fields });
}

const folders: ProjectFolder[] = [];

async function detect(
  files: Readonly<Record<string, string>>,
): Promise<ProjectDetection> {
  const folder = createProjectFolder(files);
  folders.push(folder);
  return new NodeProjectDetector().detect(folder.root);
}

async function reasonOf(
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const detection = await detect(files);
  return detection.outcome === 'unsupported' ? detection.reason : 'supported';
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

describe('NodeProjectDetector', () => {
  describe('detect', () => {
    describe('when the project is tested with Jest', () => {
      it('should give the runner, the install and every eligible file', async () => {
        const detection = await detect({
          ...SOURCES,
          'package.json': jestManifest(),
          'package-lock.json': JEST_LOCK,
          'jest.config.json': '{}',
        });

        expect(detection).toEqual({
          outcome: 'supported',
          project: DetectedProject.create({
            testRunner: 'jest',
            testRunnerVersion: '30.5.2',
            packageManager: 'npm',
            configFile: FilePath.create('jest.config.json'),
          }),
          parameters: ScanParameters.create({
            testRunner: 'jest',
            testRunnerVersion: '30.5.2',
            coverageProvider: 'babel',
            fileListRule: 'typescript-sources-v1',
          }),
          install: {
            command: [
              'npm',
              'ci',
              '--ignore-scripts',
              '--no-audit',
              '--no-fund',
              '--cache',
              'node_modules/.cache/coverage-autopilot/install',
            ],
            environment: {},
          },
          eligibleFiles: [
            'src/broken.ts',
            'src/types.ts',
            'src/unused.ts',
            'src/used.ts',
          ].map((path) => FilePath.create(path)),
        });
      });

      it('should take the configuration from package.json when it has one', async () => {
        const detection = await detect({
          'package.json': jestManifest({ jest: { testEnvironment: 'node' } }),
          'package-lock.json': JEST_LOCK,
        });

        expect(
          detection.outcome === 'supported' &&
            detection.project.configFile?.value,
        ).toBe('package.json');
      });

      it('should have no configuration when it has none', async () => {
        const detection = await detect({
          'package.json': jestManifest(),
          'package-lock.json': JEST_LOCK,
        });

        expect(
          detection.outcome === 'supported' && detection.project.configFile,
        ).toBeNull();
      });
    });

    describe('when the project is tested with Vitest', () => {
      const vitest = (provider: string): Record<string, string> => ({
        'package.json': manifest({
          devDependencies: { vitest: '4.1.12', [provider]: '4.1.12' },
        }),
        'package-lock.json': lockfileOf({ vitest: '4.1.12' }),
        'vitest.config.ts': 'export default {};\n',
      });

      it.each([
        ['@vitest/coverage-v8', 'v8'],
        ['@vitest/coverage-istanbul', 'istanbul'],
      ])('should measure through %s', async (provider, name) => {
        const detection = await detect(vitest(provider));

        expect(detection).toMatchObject({
          outcome: 'supported',
          project: { testRunner: 'vitest', testRunnerVersion: '4.1.12' },
          parameters: { coverageProvider: name },
        });
        expect(
          detection.outcome === 'supported' &&
            detection.project.configFile?.value,
        ).toBe('vitest.config.ts');
      });

      it('should be unsupported without a provider of coverage', async () => {
        await expect(reasonOf(vitest('left-pad'))).resolves.toBe(
          'no_coverage_provider',
        );
      });
    });

    describe('when package.json declares both runners', () => {
      const both = (test: string): Record<string, string> => ({
        'package.json': manifest({
          scripts: { test },
          devDependencies: {
            jest: '30.5.2',
            vitest: '4.1.12',
            '@vitest/coverage-v8': '4.1.12',
          },
        }),
        'package-lock.json': lockfileOf({ jest: '30.5.2', vitest: '4.1.12' }),
      });

      it('should take the one the test script names', async () => {
        const detection = await detect(both('vitest run'));

        expect(detection).toMatchObject({ project: { testRunner: 'vitest' } });
      });

      it.each(['jest && vitest run', 'node scripts/test.js'])(
        'should be ambiguous when the script is "%s"',
        async (test) => {
          await expect(reasonOf(both(test))).resolves.toBe(
            'ambiguous_test_runner',
          );
        },
      );

      it('should be ambiguous when there is no test script', async () => {
        const files = both('');
        files['package.json'] = manifest({
          devDependencies: { jest: '30.5.2', vitest: '4.1.12' },
        });

        await expect(reasonOf(files)).resolves.toBe('ambiguous_test_runner');
      });
    });

    describe('when the repository cannot be measured', () => {
      it.each<[string, Record<string, string>]>([
        ['no_package_manifest', { 'src/a.ts': SOURCE }],
        ['invalid_package_manifest', { 'package.json': '{ "name": ' }],
        ['invalid_package_manifest', { 'package.json': '[]' }],
        [
          'monorepo',
          { 'package.json': jestManifest({ workspaces: ['packages/*'] }) },
        ],
        [
          'monorepo',
          {
            'package.json': jestManifest(),
            'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
          },
        ],
        ['monorepo', { 'package.json': jestManifest(), 'lerna.json': '{}' }],
        [
          'unsupported_package_manager',
          { 'package.json': jestManifest(), 'bun.lock': '{}' },
        ],
        ['no_lockfile', { 'package.json': jestManifest() }],
        [
          'no_lockfile',
          {
            'package.json': jestManifest(),
            'package-lock.json': lockfileOf({ vitest: '4.1.12' }),
          },
        ],
        [
          'no_lockfile',
          { 'package.json': jestManifest(), 'package-lock.json': '[' },
        ],
        [
          'no_lockfile',
          {
            'package.json': jestManifest(),
            'pnpm-lock.yaml': pnpmLockfileOf({ vitest: '4.1.12' }),
          },
        ],
        [
          'no_test_runner',
          { 'package.json': manifest({}), 'package-lock.json': JEST_LOCK },
        ],
        [
          'other_test_runner',
          {
            'package.json': manifest({ devDependencies: { mocha: '11.0.0' } }),
            'package-lock.json': JEST_LOCK,
          },
        ],
      ])('should say %s', async (reason, files) => {
        await expect(reasonOf(files)).resolves.toBe(reason);
      });
    });
  });

  describe('the list of eligible files', () => {
    it('should leave out what is not a source to test', async () => {
      const detection = await detect({
        'package.json': jestManifest(),
        'package-lock.json': JEST_LOCK,
        'src/a.ts': SOURCE,
        'src/b.tsx': SOURCE,
        'src/c.mts': SOURCE,
        'src/[id].ts': SOURCE,
        'src/a.d.ts': SOURCE,
        'src/a.test.ts': SOURCE,
        'src/a.spec.tsx': SOURCE,
        'src/a.js': SOURCE,
        'src/__tests__/a.ts': SOURCE,
        'src/.hidden/a.ts': SOURCE,
        'node_modules/x/a.ts': SOURCE,
        'dist/a.ts': SOURCE,
        'vitest.config.ts': SOURCE,
      });

      expect(
        detection.outcome === 'supported' &&
          detection.eligibleFiles.map((path) => path.value),
      ).toEqual(['src/[id].ts', 'src/a.ts', 'src/b.tsx', 'src/c.mts']);
    });

    it('should not follow a link out of the working copy', async () => {
      const outside = createProjectFolder({ 'secret.ts': SOURCE });
      folders.push(outside);
      const folder = createProjectFolder({
        'package.json': jestManifest(),
        'package-lock.json': JEST_LOCK,
        'src/a.ts': SOURCE,
      });
      folders.push(folder);
      symlinkSync(outside.root, join(folder.root, 'src', 'linked'));
      symlinkSync(join(outside.root, 'secret.ts'), join(folder.root, 'b.ts'));

      const detection = await new NodeProjectDetector().detect(folder.root);

      expect(
        detection.outcome === 'supported' &&
          detection.eligibleFiles.map((path) => path.value),
      ).toEqual(['src/a.ts']);
    });
  });
});
