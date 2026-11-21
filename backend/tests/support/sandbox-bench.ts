import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach } from 'vitest';

import { DockerSandbox } from '#infrastructure/sandbox/docker-sandbox.adapter';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';
import type { SandboxCommandRequest } from '#ports/sandbox.port';
import { FixedClock } from '#tests/support/fixed-clock';
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

/** The name of the first container a sandbox of the bench starts. */
export const FIRST_CONTAINER =
  'coverage-autopilot-00000000-0000-4000-8000-000000000001';

const START = '2026-11-21T10:00:00.000Z';
const MINUTE = 60_000;
const OUTPUT_BYTES = 1_000;

/** A sandbox on the stand-in engine, and what the stand-in recorded. */
export interface SandboxBench {
  readonly clock: FixedClock;
  settings(play?: EnginePlay, outputBytes?: number): SandboxSettings;
  sandbox(settings: SandboxSettings): DockerSandbox;
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

/** Each test of the file gets a new record, a new clock and new ids. */
export function useSandboxBench(): SandboxBench {
  const state = { folder: '', clock: new FixedClock(START) };
  const record = (): string => join(state.folder, 'calls.jsonl');
  beforeEach(() => {
    state.folder = mkdtempSync(join(tmpdir(), 'sandbox-'));
    state.clock = new FixedClock(START);
  });
  afterEach(() => {
    rmSync(state.folder, { recursive: true, force: true });
  });
  return {
    get clock() {
      return state.clock;
    },
    settings: (play = {}, outputBytes = OUTPUT_BYTES) => ({
      engine: standInEngine(record(), play),
      image: 'sandbox-image:1',
      user: '1000:1000',
      limits: {
        memoryMb: 2048,
        cpus: 1.5,
        processes: 256,
        scratchMb: 64,
        outputBytes,
      },
    }),
    sandbox: (settings) =>
      new DockerSandbox(settings, state.clock, new SequentialIdGenerator()),
    calls: () => callsIn(record()),
  };
}
