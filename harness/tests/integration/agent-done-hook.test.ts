import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type GateRun, runFullGate } from '#harness/agents/full-gate';
import { LAST_VERDICT, readLastVerdict } from '#harness/agents/last-verdict';
import { fingerprintOf } from '#harness/agents/tree';
import { whenDone } from '#harness/agents/when-done';
import { useBench } from '#harness/tests/support/bench';

const bench = useBench();

const RED: GateRun = {
  passed: false,
  output:
    '\n== format\nAll files are fine\n\n== lint\n' +
    'a.ts: 1 problem\n\ncheck full: failed at lint\n',
};
const GREEN: GateRun = { passed: true, output: '\ncheck full: passed\n' };

const SENT_BACK = JSON.stringify({
  decision: 'block',
  reason:
    'check full is red at lint. Make it green in the code, ' +
    'then stop again.\n\na.ts: 1 problem\n\ncheck full: failed at lint',
});
const TOLD = JSON.stringify({
  systemMessage:
    'check full is red at lint, ' +
    'and the agent stopped without a change to the tree.',
});

describe('whenDone', () => {
  let judged: string[] = [];
  const root = (): string => bench.repository.root;

  /** Says it is done, with a gate that gives this run. */
  function done(run: GateRun): string {
    return whenDone(root(), (tree) => {
      judged.push(tree);
      return run;
    });
  }

  beforeEach(() => {
    judged = [];
    bench.repository.write('.gitignore', '/reports/\n');
    bench.repository.write('src/a.ts', 'export const a = 1;\n');
  });

  it('should let the agent stop on a tree that passes, and say nothing', () => {
    expect(done(GREEN)).toBe('');
    expect(judged).toEqual([root()]);
  });

  it('should remember the tree that passed', () => {
    const tree = fingerprintOf(root());
    done(GREEN);

    expect(readLastVerdict(root())).toEqual({ tree, redStep: undefined });
    expect(fingerprintOf(root())).toBe(tree);
  });

  it('should not judge again a tree that passed', () => {
    done(GREEN);

    expect(done(RED)).toBe('');
    expect(judged).toHaveLength(1);
  });

  it('should send the agent back with the output of the red step', () => {
    expect(done(RED)).toBe(SENT_BACK);
  });

  it('should remember the tree that was red, and its step', () => {
    const tree = fingerprintOf(root());
    done(RED);

    expect(readLastVerdict(root())).toEqual({ tree, redStep: 'lint' });
  });

  it('should send the agent back one time only for one tree', () => {
    done(RED);

    expect(done(GREEN)).toBe(TOLD);
    expect(judged).toHaveLength(1);
  });

  it('should judge again when the tree changed after a red run', () => {
    done(RED);
    bench.repository.write('src/a.ts', 'export const a = 2;\n');

    expect(done(RED)).toBe(SENT_BACK);
    expect(done(GREEN)).toBe(TOLD);
    expect(judged).toHaveLength(2);
  });

  it('should judge again when the tree changed after a green run', () => {
    done(GREEN);
    bench.repository.write('src/b.ts', '');

    expect(done(RED)).toBe(SENT_BACK);
  });

  it('should judge again when the kept verdict cannot be read', () => {
    done(GREEN);
    bench.repository.write(LAST_VERDICT, 'not a verdict');

    expect(done(RED)).toBe(SENT_BACK);
  });
});

describe('runFullGate', () => {
  const GATE = 'harness/bin/check.ts';
  const root = (): string => bench.repository.root;

  beforeEach(() => {
    vi.stubEnv('HARNESS_INSIDE_GATE', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** A stand-in gate that prints to both streams and exits with a code. */
  function gateThatExitsWith(code: number): void {
    bench.repository.write(
      GATE,
      'process.stdout.write(`out ${process.argv.slice(2).join(",")}\\n`);\n' +
        'process.stderr.write("err\\n");\n' +
        'process.stdout.write(`${process.env.HARNESS_INSIDE_GATE}\\n`);\n' +
        'process.stdout.write(`${process.cwd().endsWith(' +
        'import.meta.dirname.slice(0, -"/harness/bin".length))}\\n`);\n' +
        `process.exitCode = ${String(code)};\n`,
    );
  }

  it('should start the full profile in the tree, and pass with it', () => {
    gateThatExitsWith(0);

    expect(runFullGate(root())).toEqual({
      passed: true,
      output: 'out full\nerr\n1\ntrue\n',
    });
  });

  it('should not start a gate from inside a gate', () => {
    gateThatExitsWith(0);
    vi.stubEnv('HARNESS_INSIDE_GATE', '1');

    expect(() => runFullGate(root())).toThrow(
      'A gate does not start a gate: this process was started by a run of ' +
        'the gate, so a hook that asks for the gate again is refused.',
    );
    expect(existsSync(join(root(), 'reports/gate/output.log'))).toBe(false);
  });

  it('should fail with a gate that fails', () => {
    gateThatExitsWith(1);

    expect(runFullGate(root()).passed).toBe(false);
  });

  it('should fail when the gate cannot start', () => {
    const run = runFullGate(root());

    expect(run.passed).toBe(false);
    expect(run.output).toContain('check.ts');
  });

  it('should keep the output where git does not see it', () => {
    gateThatExitsWith(0);
    runFullGate(root());
    const log = join(root(), 'reports/gate/output.log');

    expect(existsSync(log)).toBe(true);
    expect(readFileSync(log, 'utf8')).toContain('out full');
  });

  it('should not keep the output of the run before', () => {
    gateThatExitsWith(0);
    runFullGate(root());
    bench.repository.write(GATE, 'process.stdout.write("second\\n");\n');

    expect(runFullGate(root()).output).toBe('second\n');
  });
});
