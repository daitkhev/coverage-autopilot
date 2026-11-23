import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { type Download, programOf } from '#harness/gate/outside-program';
import {
  type OutsideTool,
  readOutsideTool,
} from '#harness/shared/outside-tools';
import { useBench } from '#harness/tests/support/bench';

const bench = useBench();

const MAY_RUN = 0o755;
const URL = 'https://example.com/tool.tar.gz';

describe('programOf', () => {
  let archive = '';
  let kept = '';
  let tool: OutsideTool = readOutsideTool('gitleaks', 'linux-x64');
  let asked: string[] = [];

  /** A stand-in for the network: it gives the archive of the test. */
  const fetch: Download = (url, to) => {
    asked.push(url);
    copyFileSync(archive, to);
    return true;
  };

  /** Packs files into an archive and gives its path. */
  function pack(name: string, files: readonly string[]): string {
    const path = join(bench.repository.root, name);
    spawnSync('tar', ['-czf', path, '-C', bench.repository.root, ...files]);
    return path;
  }

  beforeEach(() => {
    asked = [];
    kept = join(bench.repository.root, 'kept');
    bench.repository.write('tool', '#!/bin/sh\necho "tool $1"\n');
    bench.repository.write('LICENSE', 'a licence\n');
    chmodSync(join(bench.repository.root, 'tool'), MAY_RUN);
    archive = pack('tool.tar.gz', ['tool', 'LICENSE']);
    tool = {
      name: 'tool',
      version: '1.2.3',
      program: 'tool',
      url: URL,
      sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
    };
  });

  it('should download the archive and give a program that runs', () => {
    const program = programOf(tool, kept, fetch);

    expect(asked).toEqual([URL]);
    expect(spawnSync(program, ['here'], { encoding: 'utf8' }).stdout).toBe(
      'tool here\n',
    );
  });

  it('should keep the program under its version and its checksum', () => {
    const folder = `tool-1.2.3-${tool.sha256}`;

    expect(programOf(tool, kept, fetch)).toBe(join(kept, folder, 'tool'));
    expect(readdirSync(kept)).toEqual([folder]);
    expect(readdirSync(join(kept, folder))).toEqual(['tool']);
  });

  it('should not download a program it has', () => {
    const first = programOf(tool, kept, fetch);

    expect(programOf(tool, kept, fetch)).toBe(first);
    expect(asked).toHaveLength(1);
  });

  it('should download again for another version', () => {
    programOf(tool, kept, fetch);
    programOf({ ...tool, version: '1.2.4' }, kept, fetch);

    expect(asked).toHaveLength(2);
    expect(readdirSync(kept)).toHaveLength(2);
  });

  it('should not take a kept program for one with another checksum', () => {
    programOf(tool, kept, fetch);
    const last = tool.sha256.endsWith('0') ? '1' : '0';
    const other = { ...tool, sha256: tool.sha256.slice(0, -1) + last };

    expect(() => programOf(other, kept, fetch)).toThrow(
      'tool: the archive is not the one the policy names.',
    );
  });

  it('should refuse an archive with another checksum, and keep nothing', () => {
    const other = { ...tool, sha256: 'a'.repeat(64) };

    expect(() => programOf(other, kept, fetch)).toThrow(
      'tool: the archive is not the one the policy names. ' +
        `Its checksum is ${tool.sha256}.`,
    );
    expect(readdirSync(kept)).toEqual([]);
  });

  it('should refuse when nothing can be downloaded, and keep nothing', () => {
    expect(() => programOf(tool, kept, () => false)).toThrow(
      `tool: no download from ${URL}`,
    );
    expect(readdirSync(kept)).toEqual([]);
  });

  it('should refuse an archive that does not hold the program', () => {
    archive = pack('other.tar.gz', ['LICENSE']);
    const other = {
      ...tool,
      sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
    };

    expect(() => programOf(other, kept, fetch)).toThrow(
      'tool: the archive holds no tool.',
    );
    expect(readdirSync(kept)).toEqual([]);
  });

  it('should leave the archive out of what it keeps', () => {
    const program = programOf(tool, kept, fetch);

    expect(existsSync(join(program, '..', 'archive'))).toBe(false);
  });
});

describe('tools.json', () => {
  const MACHINES = ['darwin-arm64', 'linux-x64'];
  const NAMES = ['actionlint', 'gitleaks', 'zizmor'];

  it.each(NAMES.flatMap((name) => MACHINES.map((machine) => [name, machine])))(
    'should name one release of %s for %s, with its checksum',
    (name, machine) => {
      const tool = readOutsideTool(name, machine);

      expect(tool.program).toBe(name);
      expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(tool.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(tool.url).toMatch(
        new RegExp(
          `^https://github\\.com/[\\w-]+/${name}/releases/download/` +
            `v${tool.version.replaceAll('.', '\\.')}/[\\w.-]+\\.tar\\.gz$`,
        ),
      );
    },
  );

  it('should give each machine an archive of its own', () => {
    const sums = NAMES.flatMap((name) =>
      MACHINES.map((machine) => readOutsideTool(name, machine).sha256),
    );

    expect(new Set(sums).size).toBe(sums.length);
  });

  it('should refuse a tool it does not name', () => {
    expect(() => readOutsideTool('shellcheck', 'linux-x64')).toThrow(
      'tools.json has no tool named "shellcheck".',
    );
    expect(() => readOutsideTool('toString', 'linux-x64')).toThrow(
      'tools.json has no tool named "toString".',
    );
  });

  it('should refuse a machine it has no archive for', () => {
    expect(() => readOutsideTool('gitleaks', 'win32-x64')).toThrow(
      'tools.json has no gitleaks for win32-x64.',
    );
    expect(() => readOutsideTool('gitleaks', 'toString')).toThrow(
      'tools.json has no gitleaks for toString.',
    );
  });
});
