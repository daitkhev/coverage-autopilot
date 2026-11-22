import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach } from 'vitest';

import { DockerSandbox } from '#infrastructure/sandbox/docker-sandbox.adapter';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';
import type {
  SandboxCommandRequest,
  SandboxCommandResult,
} from '#ports/sandbox.port';
import { FixedClock } from '#tests/support/fixed-clock';
import { RecordingLogger } from '#tests/support/recording-logger';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';
import {
  callsIn,
  type EngineCall,
  type EnginePlay,
  standInEngine,
} from '#tests/support/stand-in-engine';

/** The working copy of a request. The stand-in never opens it. */
export const WORKING_COPY =
  '/instance/working-copies/00000000-0000-4000-8000-0000000000aa';

/** The instance the sandboxes of the bench label their containers with. */
export const BENCH_INSTANCE = 'instance-of-the-bench';

/** The name of the first container a sandbox of the bench starts. */
export const FIRST_CONTAINER =
  'coverage-autopilot-00000000-0000-4000-8000-000000000001';

const START = '2026-11-21T10:00:00.000Z';
const MINUTE = 60_000;
const OUTPUT_BYTES = 1_000;

/** A sandbox on the stand-in engine, and what the stand-in recorded. */
export interface SandboxBench {
  readonly clock: FixedClock;
  /** Every line the sandboxes of the test wrote. */
  readonly logger: RecordingLogger;
  settings(play?: EnginePlay, outputBytes?: number): SandboxSettings;
  sandbox(settings: SandboxSettings): DockerSandbox;
  /** Runs a request on a sandbox whose engine plays `play`. */
  run(
    play?: EnginePlay,
    overrides?: Partial<SandboxCommandRequest>,
  ): Promise<SandboxCommandResult>;
  calls(): EngineCall[];
}

/** A request that a test changes in the field it is about. */
export function commandRequest(
  overrides: Partial<SandboxCommandRequest> = {},
): SandboxCommandRequest {
  return {
    workingCopyPath: WORKING_COPY,
    command: ['npx', 'vitest', 'run', '--coverage'],
    environment: { HOME: '/tmp', CI: 'true' },
    network: 'none',
    timeoutMs: MINUTE,
    ...overrides,
  };
}

/** Settings over the stand-in engine, which records into `record`. */
function benchSettings(
  record: string,
  play: EnginePlay,
  outputBytes: number,
): SandboxSettings {
  return {
    engine: standInEngine(record, play),
    instance: BENCH_INSTANCE,
    image: 'sandbox-image:1',
    user: '1000:1000',
    limits: {
      memoryMb: 2048,
      cpus: 1.5,
      processes: 256,
      scratchMb: 64,
      outputBytes,
    },
  };
}

/**
 * Each test of the file gets a new record, a new clock, a new logger and
 * new ids.
 */
export function useSandboxBench(): SandboxBench {
  const state = {
    folder: '',
    clock: new FixedClock(START),
    logger: new RecordingLogger(),
  };
  const record = (): string => join(state.folder, 'calls.jsonl');
  beforeEach(() => {
    state.folder = mkdtempSync(join(tmpdir(), 'sandbox-'));
    state.clock = new FixedClock(START);
    state.logger = new RecordingLogger();
  });
  afterEach(() => {
    rmSync(state.folder, { recursive: true, force: true });
  });
  const settings = (
    play: EnginePlay = {},
    outputBytes = OUTPUT_BYTES,
  ): SandboxSettings => benchSettings(record(), play, outputBytes);
  const sandbox = (of: SandboxSettings): DockerSandbox =>
    new DockerSandbox(
      of,
      state.clock,
      new SequentialIdGenerator(),
      state.logger,
    );
  return {
    get clock() {
      return state.clock;
    },
    get logger() {
      return state.logger;
    },
    settings,
    sandbox,
    run: async (play = {}, overrides = {}) =>
      sandbox(settings(play)).run(
        commandRequest(overrides),
        new AbortController().signal,
      ),
    calls: () => callsIn(record()),
  };
}
