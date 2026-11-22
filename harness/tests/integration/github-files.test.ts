import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROFILES } from '#harness/gate/steps';
import { readFrozenPolicy } from '#harness/shared/frozen';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

const WORKFLOWS = '.github/workflows';
const FROZEN = 'frozen.yml';

/** An action at one commit, with the version that commit is as a note. */
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;

/** The steps of `ci` that a job of their own runs. */
const OWN_JOB = ['compare', 'mutation'];

function fileOf(path: string): string {
  return readFileSync(join(REPOSITORY_ROOT, path), 'utf8');
}

const workflows = readdirSync(join(REPOSITORY_ROOT, WORKFLOWS)).sort();

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** The text of every `run`, with the lines that continue it. */
function scriptsOf(text: string): string[] {
  const lines = text.split('\n');
  return lines.flatMap((line, index) => {
    if (!/^\s*(?:- )?run:/.test(line)) {
      return [];
    }
    const key = line.indexOf('run:');
    const rest = lines.slice(index + 1);
    const end = rest.findIndex(
      (next) => next.trim() !== '' && indentOf(next) <= key,
    );
    return [
      [line, ...rest.slice(0, end === -1 ? rest.length : end)].join('\n'),
    ];
  });
}

describe('the workflows', () => {
  it('should be the gate and the check of frozen files', () => {
    expect(workflows).toEqual(['ci.yml', FROZEN]);
  });

  describe.each(workflows)('%s', (name) => {
    const text = fileOf(join(WORKFLOWS, name));

    it('should pin every action to a commit', () => {
      const used = text
        .split('\n')
        .filter((line) => line.includes('uses:'))
        .map((line) => line.slice(line.indexOf('uses:') + 'uses:'.length));

      expect(used.length).toBeGreaterThan(0);
      for (const action of used) {
        expect(action.trim()).toMatch(PINNED);
      }
    });

    it('should name the permissions of its token at the top', () => {
      expect(text).toMatch(/^permissions:/m);
      expect(text).not.toContain('write');
    });

    it('should give a script no value but through its environment', () => {
      const scripts = scriptsOf(text);

      expect(scripts.length).toBeGreaterThan(0);
      for (const script of scripts) {
        expect(script).not.toContain('${{');
      }
    });

    it('should accept no finding of a tool by a comment', () => {
      expect(text).not.toMatch(/zizmor:|actionlint:|gitleaks:/);
    });

    it('should leave no credential in a checkout', () => {
      const checkouts = text.split('actions/checkout@').slice(1);

      for (const checkout of checkouts) {
        expect(checkout).toContain('persist-credentials: false');
      }
    });

    it('should run one named version of the machine', () => {
      const machines = text.match(/runs-on: .*/g) ?? [];

      expect(new Set(machines)).toEqual(new Set(['runs-on: ubuntu-24.04']));
    });
  });
});

describe('ci.yml', () => {
  const text = fileOf(join(WORKFLOWS, 'ci.yml'));

  it('should run every step of the profile, one job a step', () => {
    const matrix = [...text.matchAll(/^ {10}- ([a-z0-9-]+)$/gm)].map(
      (match) => match[1],
    );
    const steps = (PROFILES['ci'] ?? []).filter(
      (step) => !OWN_JOB.includes(step),
    );

    expect([...matrix].sort()).toEqual([...steps].sort());
    for (const step of OWN_JOB) {
      expect(text).toContain(`\n  ${step}:\n`);
    }
  });

  it('should start the gate by its path, never through a script', () => {
    expect(text).not.toMatch(/npm (?:run|test|exec)|npx/);
    expect(text).toContain('node harness/bin/check.ts "$STEP"');
  });

  it('should hold the messages of the commits and the name of the branch', () => {
    expect(text).toContain(
      'node harness/bin/commit-messages.ts "$BASE" "$HEAD"',
    );
    expect(text).toContain('node harness/bin/branch-name.ts "$BRANCH"');
  });

  it('should not run on the event that carries a wider token', () => {
    expect(text).not.toContain('pull_request_target');
  });
});

describe('frozen.yml', () => {
  const text = fileOf(join(WORKFLOWS, FROZEN));

  it('should run on the event GitHub takes from the default branch', () => {
    expect(text).toContain('\non:\n  pull_request_target:\n');
    expect(/^on:\n(?: {2}.*\n)+/m.exec(text)?.[0]).not.toMatch(
      /^ {2}(?!pull_request_target:)\w/m,
    );
  });

  it('should give its token nothing at the top, and reading in the job', () => {
    expect(text).toContain('\npermissions: {}\n');
    expect(text).toMatch(
      /\n {4}permissions:\n {6}contents: read #.*\n {6}pull-requests: read #.*\n {4}steps:/,
    );
  });

  it('should check out the default branch and never the change', () => {
    expect(text).toContain(
      'ref: ${{ github.event.repository.default_branch }}',
    );
    expect(text.match(/ref:/g)).toHaveLength(1);
    expect(text).not.toMatch(/head\.(?:sha|ref)/);
  });

  it('should install nothing', () => {
    expect(text).not.toMatch(/npm|cache/);
  });

  it('should give the guard the list and the number of files', () => {
    expect(text).toContain(
      'node harness/bin/guard.ts "$RUNNER_TEMP/files.jsonl" "$CHANGED"',
    );
    expect(text).toContain(
      'CHANGED: ${{ github.event.pull_request.changed_files }}',
    );
  });
});

describe('CODEOWNERS', () => {
  const lines = fileOf('.github/CODEOWNERS')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split(' '));

  /** A place of the policy as CODEOWNERS writes it: from the root. */
  const fromRoot = (place: string): string => `/${place}`;

  it('should give the policy, and nothing else, to one owner', () => {
    const policy = readFrozenPolicy();
    const owned = lines.filter((line) => line.length > 1);

    expect(owned.map(([pattern]) => pattern)).toEqual([
      ...policy.places.map(fromRoot),
      ...policy.names,
    ]);
    expect(new Set(owned.map((line) => line.slice(1).join(' ')))).toEqual(
      new Set(['@daitkhev']),
    );
  });

  it('should take the free files out again, after the policy', () => {
    const free = lines.filter((line) => line.length === 1);

    expect(free.map(([pattern]) => pattern)).toEqual(
      readFrozenPolicy().free.map(fromRoot),
    );
    expect(lines.slice(-free.length)).toEqual(free);
  });
});

describe('dependabot.yml', () => {
  const updates = fileOf('.github/dependabot.yml')
    .split('  - package-ecosystem: ')
    .slice(1);

  it('should update the packages and the actions', () => {
    expect(updates.map((update) => update.split('\n')[0])).toEqual([
      'npm',
      'github-actions',
    ]);
  });

  it.each(updates)('should wait a week, weekly, into dev: %#', (update) => {
    expect(update).toContain('    schedule:\n      interval: weekly\n');
    expect(update).toContain('    cooldown:\n      default-days: 7\n');
    expect(update).toContain('    target-branch: dev\n');
    expect(update).toContain('      include: scope\n');
  });
});
