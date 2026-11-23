import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SandboxCommandResult } from '#ports/sandbox.port';
import { RecordingSandbox } from '#tests/support/recording-sandbox';
import type { MutationSettings } from '#verification/infrastructure/mutation/mutation-settings';

/** The settings of the mutation adapter in a test, its defaults. */
export const MUTATION_TEST_SETTINGS: MutationSettings = {
  toolVersion: '10.1.1',
  concurrency: 2,
  mutantTimeoutFactor: 1.5,
  mutantTimeoutMs: 5_000,
  installTimeoutMs: 600_000,
  commandEnvironment: {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: '/tmp',
    CI: 'true',
  },
};

/** The folder of a run and its files, by their paths in the working copy. */
export const FOLDER = '.coverage-autopilot-mutation';
export const CONFIG = `${FOLDER}/stryker.config.json`;
export const REPORT = `${FOLDER}/report.json`;
export const CACHE = `${FOLDER}/incremental.json`;

const STRYKER =
  'node_modules/.cache/coverage-autopilot/mutation/node_modules/@stryker-mutator/core/bin/stryker.js';

/** Files by their paths in the working copy, with their text. */
export type Files = Readonly<Record<string, string>>;

export function exitedWith(
  exitCode: number | null,
  output: string,
): SandboxCommandResult {
  return {
    outcome: 'exited',
    exitCode,
    output,
    outputTruncated: false,
    durationMs: 1_000,
  };
}

export function timedOut(output: string): SandboxCommandResult {
  return {
    outcome: 'timed_out',
    exitCode: null,
    output,
    outputTruncated: true,
    durationMs: 900_000,
  };
}

function filesIn(root: string): Files {
  const names = readdirSync(join(root, FOLDER));
  return Object.fromEntries(
    names.map((name) => [
      `${FOLDER}/${name}`,
      readFileSync(join(root, FOLDER, name), 'utf8'),
    ]),
  );
}

/**
 * A sandbox in which the install writes nothing, and the run of StrykerJS
 * writes the files a test gives into the working copy, as the tool would.
 * It keeps what the folder of the run held when the tool started.
 */
export class StrykerStandIn {
  public readonly sandbox = new RecordingSandbox();
  public found: Files = {};
  /** What the folder held at the start of each run, in turn. */
  public readonly foundInTurn: Files[] = [];
  private written: Files;
  private turns: Files[] = [];

  public constructor(written: Files = {}) {
    this.written = written;
    this.sandbox.onRun((request) => {
      if (request.command[1] === STRYKER) {
        this.runTool(request.workingCopyPath);
      }
    });
  }

  /** What the next run writes instead. */
  public writes(written: Files): this {
    this.written = written;
    return this;
  }

  /** What each of the next runs writes, one after the other. */
  public writesInTurn(...turns: Files[]): this {
    this.turns = turns;
    return this;
  }

  private runTool(root: string): void {
    this.found = filesIn(root);
    this.foundInTurn.push(this.found);
    const written = this.turns.shift() ?? this.written;
    for (const [file, content] of Object.entries(written)) {
      writeFileSync(join(root, file), content);
    }
  }
}
