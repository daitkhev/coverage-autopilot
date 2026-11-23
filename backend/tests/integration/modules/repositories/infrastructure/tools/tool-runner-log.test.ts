import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { faultFieldsOf } from '#infrastructure/logging/fault-fields';
import { JsonLogger } from '#infrastructure/logging/json-logger.adapter';
import { ToolLog } from '#infrastructure/logging/tool-log';
import { ToolFailedError } from '#repositories/infrastructure/errors/tool-failed.error';
import { ToolRunner } from '#repositories/infrastructure/tools/tool-runner';
import { FixedClock } from '#tests/support/fixed-clock';
import { RecordingLogger } from '#tests/support/recording-logger';
import { TOOL_CLOCK, toolLogOf } from '#tests/support/tool-lines';

const TOKEN = 'not-a-real-token-9021';
const ENVIRONMENT_VALUE = 'only-in-the-environment';
const LONG_ENOUGH_MS = 60_000;
const NEVER = new AbortController().signal;

/** Prints every argument it was given, then fails. */
const ECHO_AND_FAIL =
  'process.stderr.write(process.argv.slice(1).join(" ")); process.exitCode = 3';

let folder: string;

function runnerOf(script: string, log: ToolLog): ToolRunner {
  return new ToolRunner({
    name: 'tool',
    settings: {
      command: [process.execPath, '--eval', script, '--'],
      environment: { GH_TOKEN: TOKEN, ONLY: ENVIRONMENT_VALUE },
      timeoutMs: LONG_ENOUGH_MS,
    },
    secrets: [TOKEN],
    log,
  });
}

/**
 * The logger of the service, writing JSON lines into a text. It is told
 * of no secret, so whatever is hidden was hidden by the runner.
 */
function serviceLogger(): { logger: JsonLogger; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write: (chunk: Buffer, _encoding, done) => {
      chunks.push(chunk.toString('utf8'));
      done();
    },
  });
  const logger = new JsonLogger(new FixedClock('2026-11-22T08:00:00.000Z'), {
    stream,
    level: 'debug',
    secrets: [],
  });
  return { logger, text: () => chunks.join('') };
}

beforeEach(() => {
  folder = realpathSync(mkdtempSync(join(tmpdir(), 'tool-runner-log-')));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('ToolRunner', () => {
  describe('run', () => {
    it('should write one debug line with the program, its arguments, its exit code and its time', async () => {
      const logger = new RecordingLogger();
      const runner = runnerOf('process.exitCode = 2', toolLogOf(logger));

      await runner.run(
        { arguments: ['status', 'a b'], directory: folder },
        NEVER,
      );

      expect(logger.lines).toEqual([
        {
          level: 'debug',
          message: 'A program ended.',
          fields: {
            component: 'tools',
            program: process.execPath,
            arguments: '--eval process.exitCode = 2 -- status a b',
            exitCode: 2,
            durationMs: 0,
          },
        },
      ]);
    });

    it('should write the line of a program that could not start, with no exit code', async () => {
      const logger = new RecordingLogger();
      const runner = new ToolRunner({
        name: 'gone',
        settings: {
          command: ['no-such-program-of-the-tests'],
          environment: {},
          timeoutMs: LONG_ENOUGH_MS,
        },
        secrets: [],
        log: new ToolLog(logger, TOOL_CLOCK),
      });

      await expect(
        runner.run({ arguments: [], directory: folder }, NEVER),
      ).rejects.toThrow();

      expect(logger.lines).toMatchObject([
        { fields: { program: 'no-such-program-of-the-tests', exitCode: null } },
      ]);
    });
  });

  describe('when a token is given to the program as an argument and comes back in its output', () => {
    it('should keep it out of every line, the line of the call and the line of the fault', async () => {
      const { logger, text } = serviceLogger();
      const runner = runnerOf(ECHO_AND_FAIL, new ToolLog(logger, TOOL_CLOCK));
      const call = {
        arguments: ['--token', TOKEN, `https://x:${TOKEN}@github.com/a/b`],
        directory: folder,
        input: TOKEN,
      };

      let failed: unknown;
      try {
        await runner.runChecked(call, NEVER);
      } catch (error) {
        failed = error;
        // The worker writes the fault of a job with these fields.
        logger.error('The handler of a job failed.', faultFieldsOf(error));
      }

      expect(failed).toBeInstanceOf(ToolFailedError);
      const lines = text()
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line) as { fields: Record<string, unknown> });
      expect(lines).toHaveLength(2);
      expect(lines[0]?.fields['arguments']).toBe(
        `--eval ${ECHO_AND_FAIL} -- --token [hidden] ` +
          'https://x:[hidden]@github.com/a/b',
      );
      expect(lines[1]?.fields['errorMessage']).toContain('[hidden]');
      expect(text()).not.toContain(TOKEN);
      expect(text()).not.toContain(ENVIRONMENT_VALUE);
    });
  });
});
