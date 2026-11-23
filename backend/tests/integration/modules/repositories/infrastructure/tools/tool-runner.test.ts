import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ToolFailedError } from '#repositories/infrastructure/errors/tool-failed.error';
import { ToolMissingError } from '#repositories/infrastructure/errors/tool-missing.error';
import { ToolOutputTooLargeError } from '#repositories/infrastructure/errors/tool-output-too-large.error';
import { ToolStoppedError } from '#repositories/infrastructure/errors/tool-stopped.error';
import { ToolTimedOutError } from '#repositories/infrastructure/errors/tool-timed-out.error';
import type { ToolSettings } from '#repositories/infrastructure/repositories-settings';
import { ToolRunner } from '#repositories/infrastructure/tools/tool-runner';
import { toolLogOf } from '#tests/support/tool-lines';

const SECRET = 'not-a-real-secret-4711';
const LONG_ENOUGH_MS = 60_000;
const NEVER = new AbortController().signal;

let folder: string;

/**
 * A runner whose program is Node with a script of the test. After `--`,
 * an argument goes to the script and not to Node.
 */
function runnerOf(
  script: string,
  limits: Partial<Pick<ToolSettings, 'timeoutMs' | 'outputLimitBytes'>> = {},
): ToolRunner {
  return new ToolRunner({
    name: 'tool',
    settings: {
      command: [process.execPath, '--eval', script, '--'],
      environment: { ONLY: 'this', SECRET },
      timeoutMs: LONG_ENOUGH_MS,
      ...limits,
    },
    secrets: [SECRET],
    log: toolLogOf(),
  });
}

beforeEach(() => {
  folder = realpathSync(mkdtempSync(join(tmpdir(), 'tool-runner-')));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('ToolRunner', () => {
  describe('run', () => {
    it('should start the program in the folder it is given', async () => {
      const run = await runnerOf('process.stdout.write(process.cwd())').run(
        { arguments: [], directory: folder },
        NEVER,
      );

      expect(run).toMatchObject({ exitCode: 0, stdout: folder });
    });

    it('should give the program exactly the variables of its settings', async () => {
      const script =
        'process.stdout.write(JSON.stringify([process.env.ONLY, process.env.HOME]))';

      const run = await runnerOf(script).run(
        { arguments: [], directory: folder },
        NEVER,
      );

      expect(JSON.parse(run.stdout)).toEqual(['this', null]);
    });

    it('should pass the arguments as a list, untouched by a shell', async () => {
      const script =
        'process.stdout.write(JSON.stringify(process.argv.slice(1)))';

      const run = await runnerOf(script).run(
        { arguments: ['$HOME', 'a b', '; rm -rf /'], directory: folder },
        NEVER,
      );

      expect(JSON.parse(run.stdout)).toEqual(['$HOME', 'a b', '; rm -rf /']);
    });

    it('should write the input to the standard input', async () => {
      const run = await runnerOf('process.stdin.pipe(process.stdout)').run(
        { arguments: [], directory: folder, input: 'patch text' },
        NEVER,
      );

      expect(run.stdout).toBe('patch text');
    });

    it('should give a failure of the program as its exit code', async () => {
      const run = await runnerOf(
        'process.stderr.write("refused"); process.exitCode = 3',
      ).run({ arguments: [], directory: folder }, NEVER);

      expect(run).toMatchObject({ exitCode: 3, stdout: '', output: 'refused' });
    });

    it('should keep both streams in the output', async () => {
      const run = await runnerOf(
        'process.stdout.write("out\\n"); process.stderr.write("err\\n")',
      ).run({ arguments: [], directory: folder }, NEVER);

      expect(run.output).toContain('out');
      expect(run.output).toContain('err');
    });

    it('should keep only the end of a long output', async () => {
      const run = await runnerOf(
        'process.stdout.write("a".repeat(5000) + "b".repeat(4096))',
      ).run({ arguments: [], directory: folder }, NEVER);

      expect(run.output).toBe('b'.repeat(4096));
      expect(run.stdout).toHaveLength(9096);
    });

    describe('when a secret of the environment is printed', () => {
      it('should hide it in the output it keeps', async () => {
        const run = await runnerOf(
          'console.error("token " + process.env.SECRET); process.exitCode = 1',
        ).run({ arguments: [], directory: folder }, NEVER);

        expect(run.output).toBe('token [hidden]');
        expect(run.output).not.toContain(SECRET);
      });

      it('should hide it in the message of an error', async () => {
        const failure = runnerOf(
          'console.error(process.env.SECRET); process.kill(process.pid, "SIGKILL")',
        ).run({ arguments: [], directory: folder }, NEVER);

        await expect(failure).rejects.toThrow(ToolFailedError);
        await expect(failure).rejects.toThrow('[hidden]');
        await expect(failure).rejects.not.toThrow(SECRET);
      });
    });

    describe('when the program is ended by a signal', () => {
      it('should throw ToolFailedError', async () => {
        await expect(
          runnerOf('process.kill(process.pid, "SIGKILL")').run(
            { arguments: [], directory: folder },
            NEVER,
          ),
        ).rejects.toThrow('tool was ended by a signal');
      });
    });

    describe('when no program answers to the name', () => {
      it('should throw ToolMissingError', async () => {
        const runner = new ToolRunner({
          name: 'git',
          settings: {
            command: ['no-such-program-of-the-test'],
            environment: { PATH: folder },
            timeoutMs: LONG_ENOUGH_MS,
          },
          secrets: [],
          log: toolLogOf(),
        });

        await expect(
          runner.run({ arguments: ['--version'], directory: folder }, NEVER),
        ).rejects.toThrow(ToolMissingError);
      });
    });

    describe('when the program cannot be started', () => {
      it('should throw ToolFailedError', async () => {
        const runner = new ToolRunner({
          name: 'git',
          settings: {
            command: [folder],
            environment: {},
            timeoutMs: LONG_ENOUGH_MS,
          },
          secrets: [],
          log: toolLogOf(),
        });

        await expect(
          runner.run({ arguments: [], directory: folder }, NEVER),
        ).rejects.toThrow('git could not be started.');
      });
    });

    describe('when the program runs longer than its time limit', () => {
      it('should stop it and throw ToolTimedOutError', async () => {
        const runner = runnerOf('setInterval(() => undefined, 1000)', {
          timeoutMs: 1,
        });

        await expect(
          runner.run({ arguments: ['fetch'], directory: folder }, NEVER),
        ).rejects.toThrow(ToolTimedOutError);
      });
    });

    describe('when the program writes more than its limit of output', () => {
      it('should stop it and throw ToolOutputTooLargeError', async () => {
        const runner = runnerOf(
          'setInterval(() => process.stdout.write("x".repeat(4096)), 1)',
          { outputLimitBytes: 10_000 },
        );

        await expect(
          runner.run({ arguments: ['diff'], directory: folder }, NEVER),
        ).rejects.toThrow('tool diff wrote more than 10000 bytes');
      });

      it('should count what it writes to the error stream too', async () => {
        const runner = runnerOf(
          'setInterval(() => process.stderr.write("x".repeat(4096)), 1)',
          { outputLimitBytes: 10_000 },
        );

        await expect(
          runner.run({ arguments: [], directory: folder }, NEVER),
        ).rejects.toThrow(ToolOutputTooLargeError);
      });
    });

    it('should give an output as long as its limit whole', async () => {
      const run = await runnerOf('process.stdout.write("x".repeat(10000))', {
        outputLimitBytes: 10_000,
      }).run({ arguments: [], directory: folder }, NEVER);

      expect(run.stdout).toHaveLength(10_000);
    });

    describe('when the signal of the caller aborts', () => {
      it('should stop the program and throw ToolStoppedError', async () => {
        const controller = new AbortController();
        const running = runnerOf('setInterval(() => undefined, 1000)').run(
          { arguments: ['clone'], directory: folder },
          controller.signal,
        );

        controller.abort();

        await expect(running).rejects.toThrow(ToolStoppedError);
        await expect(running).rejects.toThrow('tool clone was stopped');
      });

      it('should not start a program for a signal that has aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
          runnerOf('process.stdout.write("ran")').run(
            { arguments: [], directory: folder },
            controller.signal,
          ),
        ).rejects.toThrow(ToolStoppedError);
      });
    });
  });

  describe('kept', () => {
    it('should hide every secret it was given', () => {
      expect(runnerOf('').kept(` ${SECRET} and ${SECRET} `)).toBe(
        '[hidden] and [hidden]',
      );
    });
  });
});
