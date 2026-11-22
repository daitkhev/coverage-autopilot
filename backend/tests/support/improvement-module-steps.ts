import type { DatabaseSync } from 'node:sqlite';

import type { INestApplicationContext } from '@nestjs/common';

import type { StartImprovementCommand } from '#improvement/application/commands/start-improvement/start-improvement.command';
import { StartImprovementHandler } from '#improvement/application/commands/start-improvement/start-improvement.handler';
import type { ImprovementDto } from '#improvement/application/dto/improvement.dto';
import { GetImprovementHandler } from '#improvement/application/queries/get-improvement/get-improvement.handler';
import { JobWorker } from '#infrastructure/queue/job-worker';
import { startCommandOf } from '#tests/support/improvement-request-stand-ins';

const NEVER = new AbortController().signal;

/** What a test of the whole module does with it, step by step. */
export interface ModuleSteps {
  /** Asks for the improvement of the target and gives what was made. */
  readonly start: (
    spec?: Partial<StartImprovementCommand>,
  ) => Promise<ImprovementDto>;
  readonly read: (improvementId: string) => Promise<ImprovementDto>;
  /** The status and the outcome of every job of the improvement, in order. */
  readonly jobsOf: (improvementId: string) => [unknown, unknown][];
  /** Runs every job that may start now, each to its end. */
  readonly work: () => Promise<void>;
}

function starting(module: INestApplicationContext): ModuleSteps['start'] {
  return async (spec = {}) => {
    const result = await module
      .get(StartImprovementHandler)
      .execute(startCommandOf(spec), NEVER);
    if (result.outcome === 'refused') {
      throw new Error(`The request was refused: ${result.reason}.`);
    }
    return result.improvement;
  };
}

function reading(module: INestApplicationContext): ModuleSteps['read'] {
  return async (improvementId) => {
    const improvement = await module
      .get(GetImprovementHandler)
      .execute({ improvementId });
    if (improvement === null) {
      throw new Error(`The improvement ${improvementId} is not stored.`);
    }
    return improvement;
  };
}

function jobsIn(connection: DatabaseSync): ModuleSteps['jobsOf'] {
  return (improvementId) =>
    connection
      .prepare(
        `SELECT status, outcome FROM jobs WHERE subject_id = ?
         ORDER BY created_at, id`,
      )
      .all(improvementId)
      .map((row): [unknown, unknown] => [row['status'], row['outcome']]);
}

/** The steps over a module built and seeded by a test. */
export function moduleSteps(
  module: INestApplicationContext,
  connection: DatabaseSync,
): ModuleSteps {
  const worker = module.get(JobWorker);
  return {
    start: starting(module),
    read: reading(module),
    jobsOf: jobsIn(connection),
    work: async () => {
      await worker.poll();
      await worker.whenIdle();
    },
  };
}
