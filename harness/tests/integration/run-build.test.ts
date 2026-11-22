import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CLIENT_BUILD,
  PACKAGE_BUILD,
  runBuild,
  SERVICE_BUILD,
} from '#harness/gate/run-build';
import { END_TO_END_COMMAND, runEndToEnd } from '#harness/gate/run-end-to-end';
import { fakeHost } from '#harness/tests/support/fake-host';

const MANIFEST = {
  name: 'service',
  type: 'module',
  imports: { '#service/*': './src/*.ts' },
  dependencies: { '@coverage-autopilot/api-contracts': '0.0.0', zod: '4.6.7' },
};

const ROOT_MANIFEST = {
  name: 'acme-tool',
  version: '1.2.3',
  private: true,
  engines: { node: '>=26' },
  workspaces: ['backend', 'frontend'],
};

const CLIENT_MANIFEST = {
  name: 'client',
  imports: { '#client/jsx-runtime': './src/jsx-runtime.ts' },
  dependencies: { ink: '8.0.0' },
};

const MIGRATION = 'CREATE TABLE things (id TEXT);\n';

const WRITTEN = [`build: ${PACKAGE_BUILD.folder} was written.`];

const GREETING = `
export function greeting(name: string): string {
  return \`covered, \${name}\`;
}
`;

const ENTRY = `
import { basename } from 'node:path';

import { greeting } from '#service/greeting';

process.stdout.write(greeting(basename('/tree/acme')));
`;

const IMAGE = 'FROM scratch\n';

const CLIENT_ENTRY = `
const shown = <b>client</b>;

process.stdout.write(typeof shown);
`;

const JSX = `
export function jsx(type: string): string {
  return type;
}
`;

let root: string;

function write(file: string, text: string): void {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'build-'));
  write('package.json', JSON.stringify(ROOT_MANIFEST));
  write('backend/package.json', JSON.stringify(MANIFEST));
  write('frontend/package.json', JSON.stringify(CLIENT_MANIFEST));
  write(`${PACKAGE_BUILD.migrations.from}/0001-things.sql`, MIGRATION);
  write(PACKAGE_BUILD.generatorImage.from, IMAGE);
  write(SERVICE_BUILD.settings, JSON.stringify({ compilerOptions: {} }));
  write('backend/src/greeting.ts', GREETING);
  write(SERVICE_BUILD.entry, ENTRY);
  write(
    CLIENT_BUILD.settings,
    JSON.stringify({
      compilerOptions: { jsx: 'react-jsx', jsxImportSource: '#client' },
    }),
  );
  write('frontend/src/jsx-runtime.ts', JSX);
  write(CLIENT_BUILD.entry, CLIENT_ENTRY);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('runBuild', () => {
  it('should write one file that plain Node runs', async () => {
    const host = fakeHost({ root });

    const exitCode = await runBuild(host);
    const run = spawnSync(process.execPath, [join(root, SERVICE_BUILD.file)], {
      encoding: 'utf8',
    });

    expect(exitCode).toBe(0);
    expect(host.printed).toEqual(WRITTEN);
    expect(run.stdout).toBe('covered, acme');
  });

  it('should write the client as a program a person starts', async () => {
    await runBuild(fakeHost({ root }));

    const file = join(root, CLIENT_BUILD.file);
    const run = spawnSync(process.execPath, [file], { encoding: 'utf8' });

    expect(readFileSync(file, 'utf8').split('\n')[0]).toBe(
      '#!/usr/bin/env node',
    );
    expect(() => {
      accessSync(file, constants.X_OK);
    }).not.toThrow();
    expect(run.stdout).toBe('string');
  });

  it('should put the code of the tree in and leave a module of Node out', async () => {
    await runBuild(fakeHost({ root }));

    const built = readFileSync(join(root, SERVICE_BUILD.file), 'utf8');

    expect(built).toContain('covered, ');
    expect(built).toContain('from "node:path"');
    expect(built).not.toContain('#service/');
  });

  it('should put the migrations and one manifest beside the program', async () => {
    await runBuild(fakeHost({ root }));

    const read = (file: string): string =>
      readFileSync(join(root, file), 'utf8');

    expect(read(`${PACKAGE_BUILD.migrations.to}/0001-things.sql`)).toBe(
      MIGRATION,
    );
    expect(read(PACKAGE_BUILD.generatorImage.to)).toBe(IMAGE);
    expect(JSON.parse(read(PACKAGE_BUILD.manifest))).toEqual({
      name: 'acme-tool',
      version: '1.2.3',
      type: 'module',
      engines: { node: '>=26' },
      bin: { 'acme-tool': 'bin/client.js' },
      dependencies: { ink: '8.0.0', zod: '4.6.7' },
    });
  });

  it('should leave nothing of an earlier build in the package', async () => {
    write(`${PACKAGE_BUILD.folder}/bin/old.js`, '');

    await runBuild(fakeHost({ root }));

    expect(existsSync(join(root, PACKAGE_BUILD.folder, 'bin/old.js'))).toBe(
      false,
    );
  });

  describe('when two workspaces ask for one package at two versions', () => {
    it('should fail and name the package and both versions', async () => {
      write(
        'frontend/package.json',
        JSON.stringify({ ...CLIENT_MANIFEST, dependencies: { zod: '5.0.0' } }),
      );
      const host = fakeHost({ root });

      expect(await runBuild(host)).toBe(1);
      expect(host.printed).toEqual([
        'build: zod is asked for at 4.6.7 and at 5.0.0. The built package installs one version.',
      ]);
    });
  });

  describe('when an import of the tree leads nowhere', () => {
    it('should fail and say so in a line', async () => {
      write(SERVICE_BUILD.entry, "import '#service/missing';\n");
      const host = fakeHost({ root });

      expect(await runBuild(host)).toBe(1);
      expect(host.printed).toHaveLength(1);
      expect(host.printed[0]).toMatch(/^build: .*missing/s);
    });
  });

  describe('when the bundler warns', () => {
    it('should fail and print every warning', async () => {
      write(SERVICE_BUILD.entry, "eval('1');\n");
      const host = fakeHost({ root });

      expect(await runBuild(host)).toBe(1);
      expect(host.printed.length).toBeGreaterThan(0);
      expect(host.printed.every((line) => line.startsWith('build: '))).toBe(
        true,
      );
    });
  });
});

describe('runEndToEnd', () => {
  it('should build the service, then run the tests on the built file', async () => {
    const host = fakeHost({ root });

    expect(await runEndToEnd(host)).toBe(0);
    expect(host.printed).toEqual(WRITTEN);
    expect(host.started).toEqual([END_TO_END_COMMAND]);
  });

  it('should give the tests their own configuration and no kept frame', () => {
    expect(END_TO_END_COMMAND.arguments.join(' ')).toBe(
      'run --config vitest.e2e.config.mjs --update=none',
    );
  });

  describe('when a test fails', () => {
    it('should fail', async () => {
      const host = fakeHost({ root, passes: () => false });

      expect(await runEndToEnd(host)).toBe(1);
    });
  });

  describe('when the service does not build', () => {
    it('should fail and run no test', async () => {
      write(SERVICE_BUILD.entry, "import '#service/missing';\n");
      const host = fakeHost({ root });

      expect(await runEndToEnd(host)).toBe(1);
      expect(host.started).toEqual([]);
    });
  });
});
