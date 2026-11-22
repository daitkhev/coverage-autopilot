import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, vi } from 'vitest';

import { DockerSandbox } from '#infrastructure/sandbox/docker-sandbox.adapter';
import { SandboxImages } from '#infrastructure/sandbox/sandbox-images';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';
import type {
  SandboxCommandRequest,
  SandboxCommandResult,
} from '#ports/sandbox.port';
import { FixedClock } from '#tests/support/fixed-clock';
import { RecordingLogger } from '#tests/support/recording-logger';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';
import { SHIPPED_IMAGE_FILE } from '#tests/support/shipped-image';
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

/** The image a sandbox of the bench builds from the shipped file. */
export const BUILT_IMAGE = 'built-image:1';

/** What the engine says of an image it does not have. */
export const MISSING_IMAGE: NonNullable<EnginePlay['inspection']> = {
  exitCode: 1,
  output: [{ stream: 'stderr', text: 'Error: No such image\n' }],
};

/** The name of the first container a sandbox of the bench starts. */
export const FIRST_CONTAINER =
  'coverage-autopilot-00000000-0000-4000-8000-000000000001';

const START = '2026-11-21T10:00:00.000Z';
const MINUTE = 60_000;
const OUTPUT_BYTES = 1_000;

/** A start of the stand-in takes a fraction of a second, and seconds under load. */
const RECORD_WAIT = { timeout: 10_000 };

/** A sandbox on the stand-in engine, and what the stand-in recorded. */
export interface SandboxBench {
  readonly clock: FixedClock;
  /** Every line the sandboxes of the test wrote. */
  readonly logger: RecordingLogger;
  settings(play?: EnginePlay, outputBytes?: number): SandboxSettings;
  /** Settings whose image is built from the file the service ships. */
  builtSettings(play?: EnginePlay): SandboxSettings;
  /** A sandbox with images of its own, which the bench closes after. */
  sandbox(settings: SandboxSettings): DockerSandbox;
  /** Runs a request on a sandbox whose engine plays `play`. */
  run(
    play?: EnginePlay,
    overrides?: Partial<SandboxCommandRequest>,
  ): Promise<SandboxCommandResult>;
  /** Runs a request on a new sandbox of these settings. */
  runOn(settings: SandboxSettings): Promise<SandboxCommandResult>;
  calls(): EngineCall[];
  /** The first argument of each call, in order. */
  verbs(): string[];
  /** The calls that ran or removed a container, without those of images. */
  containerCalls(): (readonly string[])[];
  /** Settles once the stand-in recorded a call of this first argument. */
  recorded(verb: string): Promise<void>;
  /**
   * Settles once the stand-in recorded the start of a container, so the
   * image is ready and the time limit of the command runs.
   */
  started(): Promise<void>;
  /** A path in the folder of the test, which the bench removes after. */
  place(name: string): string;
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

/** What the bench holds for the test that runs. */
interface BenchState {
  folder: string;
  clock: FixedClock;
  logger: RecordingLogger;
  /** The images of every sandbox the test made. */
  readonly images: SandboxImages[];
}

/**
 * Each test of the file gets a new folder, a new clock and a new logger.
 * What the images of its sandboxes still do after a test is cut short.
 */
function useBenchState(): BenchState {
  const state: BenchState = {
    folder: '',
    clock: new FixedClock(START),
    logger: new RecordingLogger(),
    images: [],
  };
  beforeEach(() => {
    state.folder = mkdtempSync(join(tmpdir(), 'sandbox-'));
    state.clock = new FixedClock(START);
    state.logger = new RecordingLogger();
  });
  afterEach(async () => {
    for (const images of state.images.splice(0)) {
      await images.onModuleDestroy();
    }
    rmSync(state.folder, { recursive: true, force: true });
  });
  return state;
}

/** Settings over the stand-in engine, which records into `record`. */
function settingsIn(
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

/** A sandbox whose images and itself write into the logger of the test. */
function sandboxIn(
  state: BenchState,
  settings: SandboxSettings,
): DockerSandbox {
  const images = new SandboxImages(state.logger, state.clock);
  state.images.push(images);
  return new DockerSandbox(
    settings,
    state.clock,
    new SequentialIdGenerator(),
    state.logger,
    images,
  );
}

async function untilRecorded(record: string, verb: string): Promise<void> {
  await vi.waitFor(() => {
    expect(callsIn(record).map((call) => call.arguments[0])).toContain(verb);
  }, RECORD_WAIT);
}

/**
 * Each test of the file gets a new record, a new clock, a new logger and
 * new ids.
 */
export function useSandboxBench(): SandboxBench {
  const state = useBenchState();
  const record = (): string => join(state.folder, 'calls.jsonl');
  const settings = (
    play: EnginePlay = {},
    outputBytes = OUTPUT_BYTES,
  ): SandboxSettings => settingsIn(record(), play, outputBytes);
  const sandbox = (of: SandboxSettings): DockerSandbox => sandboxIn(state, of);
  const calls = (): EngineCall[] => callsIn(record());
  return {
    get clock() {
      return state.clock;
    },
    get logger() {
      return state.logger;
    },
    settings,
    builtSettings: (play = {}) => ({
      ...settings(play),
      image: BUILT_IMAGE,
      build: { file: SHIPPED_IMAGE_FILE },
    }),
    sandbox,
    run: async (play = {}, overrides = {}) =>
      sandbox(settings(play)).run(
        commandRequest(overrides),
        new AbortController().signal,
      ),
    runOn: async (of) =>
      sandbox(of).run(commandRequest(), new AbortController().signal),
    calls,
    verbs: () => calls().map((call) => call.arguments[0] ?? ''),
    containerCalls: () =>
      calls()
        .map((call) => call.arguments)
        .filter((args) => args[0] === 'run' || args[0] === 'rm'),
    place: (name) => join(state.folder, name),
    recorded: async (verb) => untilRecorded(record(), verb),
    started: async () => untilRecorded(record(), 'run'),
  };
}
