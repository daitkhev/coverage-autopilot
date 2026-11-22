import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { expect, vi } from 'vitest';

import {
  type InstanceLocation,
  instanceLocationIn,
} from '#api/instance-location';
import { pause } from '#api/pause';
import type { ServiceWait } from '#api/polling';
import type { ServiceCommand } from '#api/service-launch';
import type { ServiceStartOptions, ServiceStep } from '#api/service-start';
import {
  standInCommand,
  type StandInPlay,
  type StandInScript,
} from '#tests/support/service-start-stand-in';

/** Stand-ins of the service in a folder of their own, as a test runs them. */
export interface ServiceStartBench {
  /** A short folder, for a socket, which the bench removes. */
  readonly root: string;
  /** The instance the client is pointed at. */
  readonly location: InstanceLocation;
  /** The steps the client said, in order. */
  readonly steps: readonly ServiceStep[];
  /** The command of a stand-in that plays `play` when it is started. */
  standIn(play: StandInPlay): ServiceCommand;
  /** Starts a stand-in that plays `play`, and waits until it listens. */
  runStandIn(play: StandInPlay): Promise<void>;
  /** The options the client is given, which record its steps. */
  options(command: ServiceCommand, wait?: ServiceWait): ServiceStartOptions;
  /**
   * A pause that lasts until `check` passes, so the stand-ins are where a
   * test wants them before the client looks again.
   */
  pauseUntil(check: () => void): (ms: number) => Promise<void>;
  /** Every request the stand-ins received, as `METHOD path`. */
  requests(): string[];
  /** The ids of the stand-ins that started, in order. */
  startedIds(): number[];
  /** The ids of the stand-ins that still run. */
  runningIds(): number[];
  /** Ends every stand-in, and removes the folder once they are gone. */
  close(): Promise<void>;
}

/** The files a stand-in shares with its bench. */
type SharedFiles = Pick<StandInScript, 'leash' | 'pids' | 'requests'>;

/** Short enough for a socket: the temporary folder of macOS is not. */
const SHORT_ROOT = '/tmp';

/**
 * A wait long enough for a stand-in to start on a loaded machine, and
 * short enough for a test to end within its own limit.
 */
export const PATIENT_WAIT: ServiceWait = { totalMs: 15_000, intervalMs: 20 };

/** How long the bench waits for its stand-ins to listen and to end. */
const PATIENT = { timeout: 15_000, interval: 20 } as const;

/** The variables the client gives the service: nothing of the test. */
export const GIVEN_VARIABLES = { GIVEN: 'a value of the test' } as const;

function linesOf(file: string): string[] {
  return existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter(Boolean)
    : [];
}

/** Whether a process of that id runs. A signal 0 only asks. */
function isRunning(id: number): boolean {
  try {
    process.kill(id, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** Writes the script of each stand-in to a file of its own. */
function scriptWriter(
  root: string,
  files: SharedFiles,
): (play: StandInPlay) => ServiceCommand {
  let written = 0;
  return (play) => {
    written += 1;
    const file = join(root, `script-${String(written)}.json`);
    const script: StandInScript = { ...play, ...files };
    writeFileSync(file, JSON.stringify(script));
    return standInCommand(file);
  };
}

/** Options that record what the client said. */
function recordingOptions(
  location: InstanceLocation,
  steps: ServiceStep[],
): ServiceStartBench['options'] {
  return (command, wait = PATIENT_WAIT) => ({
    location,
    command,
    variables: GIVEN_VARIABLES,
    wait,
    pause,
    observe: (step) => {
      steps.push(step);
    },
  });
}

/** A bench in a new folder under `/tmp`, with the instance in it. */
export function serviceStartBench(): ServiceStartBench {
  const root = mkdtempSync(join(SHORT_ROOT, 'start-'));
  const location = instanceLocationIn(join(root, 'instance'));
  const files: SharedFiles = {
    leash: join(root, 'leash'),
    pids: join(root, 'pids'),
    requests: join(root, 'requests'),
  };
  writeFileSync(files.leash, '');
  const steps: ServiceStep[] = [];
  const standIn = scriptWriter(root, files);
  const startedIds = (): number[] => linesOf(files.pids).map(Number);
  const runningIds = (): number[] => startedIds().filter(isRunning);
  return {
    root,
    location,
    steps,
    standIn,
    runStandIn: async (play) => {
      mkdirSync(location.directory, { recursive: true });
      const [program, ...rest] = standIn(play);
      spawn(program, rest, {
        env: { AUTOPILOT_INSTANCE_DIR: location.directory },
        stdio: 'ignore',
      });
      await vi.waitFor(() => {
        expect(existsSync(location.socket)).toBe(true);
      }, PATIENT);
    },
    options: recordingOptions(location, steps),
    pauseUntil: (check) => async () => {
      await vi.waitFor(check, PATIENT);
    },
    requests: () => linesOf(files.requests),
    startedIds,
    runningIds,
    close: async () => {
      rmSync(files.leash, { force: true });
      try {
        await vi.waitFor(() => {
          expect(runningIds()).toEqual([]);
        }, PATIENT);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}
