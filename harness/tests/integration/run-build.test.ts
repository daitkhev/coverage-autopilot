import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runBuild, SERVICE_BUILD } from '#harness/gate/run-build';
import { END_TO_END_COMMAND, runEndToEnd } from '#harness/gate/run-end-to-end';
import { fakeHost } from '#harness/tests/support/fake-host';

const MANIFEST = {
  name: 'service',
  type: 'module',
  imports: { '#service/*': './src/*.ts' },
};

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

let root: string;

function write(file: string, text: string): void {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'build-'));
  write('backend/package.json', JSON.stringify(MANIFEST));
  write(SERVICE_BUILD.settings, JSON.stringify({ compilerOptions: {} }));
  write('backend/src/greeting.ts', GREETING);
  write(SERVICE_BUILD.entry, ENTRY);
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
    expect(host.printed).toEqual([`build: ${SERVICE_BUILD.file} was written.`]);
    expect(run.stdout).toBe('covered, acme');
  });

  it('should put the code of the tree in and leave a module of Node out', async () => {
    await runBuild(fakeHost({ root }));

    const built = readFileSync(join(root, SERVICE_BUILD.file), 'utf8');

    expect(built).toContain('covered, ');
    expect(built).toContain('from "node:path"');
    expect(built).not.toContain('#service/');
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
    expect(host.printed).toEqual([`build: ${SERVICE_BUILD.file} was written.`]);
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
