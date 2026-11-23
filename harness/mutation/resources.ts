import { HarnessError } from '#harness/shared/harness.error';

/** What a run of the engine may take of the machine. No verdict in it. */
export interface Resources {
  /** Test runners that work at once. */
  readonly workers: number;
  /** The heap one test runner may grow to, in megabytes. */
  readonly heapMb: number;
  /** How long a mutant may run past its expected time, in milliseconds. */
  readonly timeoutMs: number;
}

/** The part of a machine the resources are worked out from. */
export interface Machine {
  readonly setting: (name: string) => string | undefined;
  readonly processors: number;
}

/** The settings a person may change, by the name of the variable. */
export const SETTINGS = {
  workers: 'HARNESS_MUTATION_WORKERS',
  memoryMb: 'HARNESS_MUTATION_MEMORY_MB',
  timeoutMs: 'HARNESS_MUTATION_TIMEOUT_MS',
} as const;

/** More test runners than this give little on the machines CI has. */
const MOST_WORKERS = 4;
const MEMORY_MB = 4096;
/** A mutant that hangs costs this much time, so it is not a minute. */
const TIMEOUT_MS = 15_000;

/** What the engine itself holds, beside its test runners. */
const ENGINE_MB = 512;
/** What one test runner needs to work without reaching its limit. */
const WORKER_MB = 768;
/** The part of a test runner that is not its heap. */
const NOT_HEAP_MB = 256;

function numberOf(machine: Machine, name: string, standard: number): number {
  const text = machine.setting(name);
  if (text === undefined) {
    return standard;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0) {
    throw new HarnessError(
      `${name} must be a whole number above zero, and it is "${text}".`,
    );
  }
  return value;
}

/**
 * Works out how many test runners fit in the memory that is allowed. Less
 * memory gives fewer test runners and a longer run, never a test runner
 * with a heap too small to work.
 */
export function resourcesOf(machine: Machine): Resources {
  const wanted = numberOf(
    machine,
    SETTINGS.workers,
    Math.min(MOST_WORKERS, machine.processors),
  );
  const memoryMb = numberOf(machine, SETTINGS.memoryMb, MEMORY_MB);
  const fitting = Math.floor((memoryMb - ENGINE_MB) / WORKER_MB);
  if (fitting < 1) {
    throw new HarnessError(
      `${SETTINGS.memoryMb} is ${String(memoryMb)}. ` +
        `One test runner needs ${String(ENGINE_MB + WORKER_MB)}.`,
    );
  }
  const workers = Math.min(wanted, fitting);
  return {
    workers,
    heapMb: Math.floor((memoryMb - ENGINE_MB) / workers) - NOT_HEAP_MB,
    timeoutMs: numberOf(machine, SETTINGS.timeoutMs, TIMEOUT_MS),
  };
}

/** The resources as options of the engine. They win over its file. */
export function engineOptions(resources: Resources): string[] {
  return [
    '--concurrency',
    String(resources.workers),
    `--testRunnerNodeArgs=--max-old-space-size=${String(resources.heapMb)}`,
    '--timeoutMS',
    String(resources.timeoutMs),
  ];
}

export function describeResources(resources: Resources): string {
  return (
    `${String(resources.workers)} test runner(s), ` +
    `${String(resources.heapMb)} MB of heap each, ` +
    `a time limit of ${String(resources.timeoutMs)} ms`
  );
}
