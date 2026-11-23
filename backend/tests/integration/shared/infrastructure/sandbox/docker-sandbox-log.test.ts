import { describe, expect, it } from 'vitest';

import {
  BUILT_IMAGE,
  BUILT_IMAGE_FILE,
  FIRST_CONTAINER,
  MISSING_IMAGE,
  useSandboxBench,
} from '#tests/support/sandbox-bench';
import { shippedImageLabel } from '#tests/support/shipped-image';

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

function exitCodes(): unknown[] {
  return bench.logger.at('debug').map((line) => line.fields['exitCode']);
}

describe('DockerSandbox', () => {
  describe('when a command runs', () => {
    it('should write one debug line for each start of the engine', async () => {
      await bench.run({ exitCode: 2 });

      expect(bench.logger.lines).toHaveLength(3);
      expect(bench.logger.at('debug')[1]?.fields).toMatchObject({
        component: 'tools',
        program: process.execPath,
        exitCode: 2,
        durationMs: 0,
      });
      expect(exitCodes()).toEqual([0, 2, 0]);
      expect(shownArguments()[0]).toMatch(
        / image inspect .+ sandbox-image:1$/u,
      );
      expect(shownArguments()[2]).toMatch(
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

      expect(shownArguments()[1]).toMatch(/ sandbox-image:1 claude$/u);
      expect(bench.containerCalls()[0]).toContain(PROMPT);
      const written = JSON.stringify(bench.logger.lines);
      expect(written).not.toContain(PROMPT);
      expect(written).not.toContain(TOKEN);
    });
  });

  describe('when the image of a command is prepared first', () => {
    it('should show every argument of a build, which carries no secret', async () => {
      await bench.runOn(bench.builtSettings({ inspection: MISSING_IMAGE }));

      expect(exitCodes()).toEqual([1, 0, 0, 0]);
      expect(shownArguments()[1]).toContain(
        ` build --tag ${BUILT_IMAGE} --label ` +
          `coverage-autopilot.build-file-sha256=${shippedImageLabel(BUILT_IMAGE)} ` +
          `--file ${BUILT_IMAGE_FILE} `,
      );
    });

    it('should show the pull of an image the engine lacks', async () => {
      await bench.runOn(bench.settings({ inspection: MISSING_IMAGE }));

      expect(shownArguments()[1]).toMatch(/ pull sandbox-image:1$/u);
    });
  });
});
