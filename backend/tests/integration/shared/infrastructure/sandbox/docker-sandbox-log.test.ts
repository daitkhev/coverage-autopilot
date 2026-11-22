import { describe, expect, it } from 'vitest';

import { FIRST_CONTAINER, useSandboxBench } from '#tests/support/sandbox-bench';

/** What a generator is asked: it may quote the text of a file. */
const PROMPT = 'Write tests for: export const secretSauce = 1;';
const TOKEN = 'not-a-real-token-3141';

const bench = useSandboxBench();

/** The arguments each line shows, the stand-in of the engine first. */
function shownArguments(): string[] {
  return bench.logger
    .at('debug')
    .map((line) => String(line.fields['arguments']));
}

describe('DockerSandbox', () => {
  describe('when a command runs', () => {
    it('should write one debug line for each start of the engine', async () => {
      await bench.run({ exitCode: 2 });

      expect(bench.logger.lines).toHaveLength(2);
      expect(bench.logger.at('debug')[0]?.fields).toMatchObject({
        component: 'tools',
        program: process.execPath,
        exitCode: 2,
        durationMs: 0,
      });
      expect(bench.logger.at('debug')[1]?.fields).toMatchObject({
        exitCode: 0,
      });
      expect(shownArguments()[1]).toMatch(
        new RegExp(` rm --force ${FIRST_CONTAINER}$`, 'u'),
      );
    });

    it('should show the program the container runs, and not its arguments, its variables or its input', async () => {
      await bench.run(
        {},
        {
          command: ['claude', '-p', PROMPT],
          environment: { CLAUDE_CODE_OAUTH_TOKEN: TOKEN },
        },
      );

      expect(shownArguments()[0]).toMatch(/ sandbox-image:1 claude$/u);
      expect(bench.calls()[0]?.arguments).toContain(PROMPT);
      const written = JSON.stringify(bench.logger.lines);
      expect(written).not.toContain(PROMPT);
      expect(written).not.toContain(TOKEN);
    });
  });
});
