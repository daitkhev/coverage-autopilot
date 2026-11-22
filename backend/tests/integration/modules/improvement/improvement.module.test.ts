import { afterEach, describe, expect, it } from 'vitest';

import { ApproveImprovementHandler } from '#improvement/application/commands/approve-improvement/approve-improvement.handler';
import { CancelImprovementHandler } from '#improvement/application/commands/cancel-improvement/cancel-improvement.handler';
import {
  IMPROVEMENT_STEPS,
  type ImprovementStep,
} from '#improvement/application/commands/run-improvement/improvement-step';
import type { StartImprovementCommand } from '#improvement/application/commands/start-improvement/start-improvement.command';
import { StartImprovementHandler } from '#improvement/application/commands/start-improvement/start-improvement.handler';
import type { ImprovementDto } from '#improvement/application/dto/improvement.dto';
import { REQUEST_HASHER } from '#improvement/application/ports/request-hasher.port';
import { TEST_GENERATOR } from '#improvement/application/ports/test-generator.port';
import { GetImprovementHandler } from '#improvement/application/queries/get-improvement/get-improvement.handler';
import { GetImprovementPatchHandler } from '#improvement/application/queries/get-improvement-patch/get-improvement-patch.handler';
import { IMPROVEMENT_REPOSITORY } from '#improvement/domain/repositories/improvement.repository';
import { InvalidImprovementSettingsError } from '#improvement/infrastructure/errors/invalid-improvement-settings.error';
import { ClaudeCodeGenerator } from '#improvement/infrastructure/generator/claude-code-generator.adapter';
import { Sha256RequestHasher } from '#improvement/infrastructure/hashing/sha256-request-hasher.adapter';
import { SqliteImprovementRepository } from '#improvement/infrastructure/persistence/sqlite-improvement.repository';
import { GENERATOR_TEST_SETTINGS } from '#tests/support/generator-request';
import {
  patchDtoOf,
  resultOf,
  windowSpent,
} from '#tests/support/improvement-generation-results';
import {
  type ImprovementWorld,
  improvementWorld,
} from '#tests/support/improvement-module-world';
import {
  REQUEST_SETTINGS,
  startCommandOf,
} from '#tests/support/improvement-request-stand-ins';
import {
  checkOf,
  hashOf,
  reportPropsOf,
} from '#tests/support/improvement-values';

const NEVER = new AbortController().signal;

let world: ImprovementWorld | undefined;

async function open(
  ...spec: Parameters<typeof improvementWorld>
): Promise<ImprovementWorld> {
  world = await improvementWorld(...spec);
  return world;
}

/** Asks for the improvement of the target and gives what was made. */
async function start(
  spec: Partial<StartImprovementCommand> = {},
): Promise<ImprovementDto> {
  const result = await opened()
    .module.get(StartImprovementHandler)
    .execute(startCommandOf(spec), NEVER);
  if (result.outcome === 'refused') {
    throw new Error(`The request was refused: ${result.reason}.`);
  }
  return result.improvement;
}

function opened(): ImprovementWorld {
  if (world === undefined) {
    throw new Error('The test has opened no world yet.');
  }
  return world;
}

async function read(improvementId: string): Promise<ImprovementDto> {
  const improvement = await opened()
    .module.get(GetImprovementHandler)
    .execute({ improvementId });
  if (improvement === null) {
    throw new Error(`The improvement ${improvementId} is not stored.`);
  }
  return improvement;
}

/** The status and the outcome of every job of the improvement, in order. */
function jobsOf(improvementId: string): [unknown, unknown][] {
  return opened()
    .connection.prepare(
      `SELECT status, outcome FROM jobs WHERE subject_id = ?
       ORDER BY created_at, id`,
    )
    .all(improvementId)
    .map((row): [unknown, unknown] => [row['status'], row['outcome']]);
}

afterEach(async () => {
  await world?.module.close();
  world = undefined;
});

describe('ImprovementModule', () => {
  it('should bind the store, the generator, the hasher and a step for each working status', async () => {
    const { module } = await open({ realGenerator: true });

    expect(module.get(IMPROVEMENT_REPOSITORY)).toBeInstanceOf(
      SqliteImprovementRepository,
    );
    expect(module.get(TEST_GENERATOR)).toBeInstanceOf(ClaudeCodeGenerator);
    expect(module.get(REQUEST_HASHER)).toBeInstanceOf(Sha256RequestHasher);
    expect(
      module
        .get<ImprovementStep[]>(IMPROVEMENT_STEPS)
        .map((step) => step.status),
    ).toEqual(['analyzing', 'generating', 'verifying', 'publishing']);
  });

  it('should take a request through one job to a pull request', async () => {
    const { work, generator, gate, publisher } = await open();
    const created = await start();

    expect(created).toMatchObject({ status: 'created', waitingFor: 'worker' });

    await work();

    const done = await read(created.id);
    expect(done).toMatchObject({
      status: 'completed',
      waitingFor: null,
      branch: `coverage-autopilot/${created.id}`,
      pullRequest: { number: 42 },
      usage: { attempts: 1, tokens: 2400 },
    });
    expect(done.attempts).toMatchObject([
      {
        number: 1,
        status: 'closed',
        generationOutcome: 'generated',
        patchHash: hashOf('a'),
        report: { verdict: 'accepted' },
      },
    ]);
    expect(generator.requests).toHaveLength(1);
    expect(gate.requests).toHaveLength(1);
    expect(publisher.publications).toMatchObject([
      { branchName: `coverage-autopilot/${created.id}` },
    ]);
    expect(jobsOf(created.id)).toEqual([
      ['completed', '{"version":1,"outcome":"completed"}'],
    ]);
  });

  describe('when the gate rejects the first patch', () => {
    it('should tell the generator why and accept the second attempt', async () => {
      const { work, generator, gate } = await open();
      gate.answers.push(reportPropsOf('rejected'));
      const { id } = await start();

      await work();

      const done = await read(id);
      expect(done.status).toBe('completed');
      expect(done.attempts.map((attempt) => attempt.report?.verdict)).toEqual([
        'rejected',
        'accepted',
      ]);
      expect(generator.requests.map((request) => request.feedback)).toEqual([
        null,
        expect.objectContaining({ reasons: ['The new test does not pass.'] }),
      ]);
    });
  });

  describe('when a patch reaches publishing', () => {
    it('should publish byte for byte the text the gate read with the endings of the settings', async () => {
      const { work, gate, publisher } = await open();
      await start();

      await work();

      const [verified] = gate.requests;
      expect(verified?.patch.text).toBe(patchDtoOf().text);
      expect(verified?.testFileSuffixes).toEqual(
        REQUEST_SETTINGS.testFileSuffixes,
      );
      expect(publisher.publications.map(({ patchText }) => patchText)).toEqual([
        verified?.patch.text,
      ]);
    });
  });

  describe('when the gate refuses the files of every patch', () => {
    it('should publish none of them', async () => {
      const { work, gate, publisher } = await open();
      const reason =
        'The patch adds .gitattributes, whose name does not end like a ' +
        'test file: .test.ts or .test.tsx.';
      const refused = {
        ...reportPropsOf('rejected'),
        reasons: [reason],
        checks: [
          { ...checkOf('test_files_only', 'rejected'), message: reason },
        ],
      };
      gate.answers.push(refused, refused, refused);
      const { id } = await start();

      await work();

      expect(publisher.publications).toEqual([]);
      expect(await read(id)).toMatchObject({
        status: 'failed',
        failure: { reason: 'budget_exhausted' },
      });
    });
  });

  describe('in review mode', () => {
    it('should wait for a person and publish the patch they approved', async () => {
      const { work, module, publisher } = await open();
      const { id } = await start({ mode: 'review' });
      await work();

      expect(await read(id)).toMatchObject({
        status: 'awaiting_approval',
        waitingFor: 'approval',
      });
      expect(publisher.publications).toEqual([]);

      const patch = await module
        .get(GetImprovementPatchHandler)
        .execute({ improvementId: id });
      expect(patch).toMatchObject({
        outcome: 'found',
        patch: { patchHash: hashOf('a') },
      });

      await module
        .get(ApproveImprovementHandler)
        .execute({ improvementId: id, patchHash: hashOf('a') });
      await work();

      expect((await read(id)).status).toBe('completed');
      expect(jobsOf(id)).toEqual([
        ['completed', '{"version":1,"outcome":"awaiting_approval"}'],
        ['completed', '{"version":1,"outcome":"completed"}'],
      ]);
    });
  });

  describe('when the window of the subscription is spent', () => {
    it('should wait with a job of its own and go on when the window opens', async () => {
      const { work, generator, clock } = await open();
      generator.answer = windowSpent(null);
      const { id } = await start();
      await work();

      const waiting = await read(id);
      expect(waiting).toMatchObject({
        status: 'waiting_for_limit',
        waitingFor: 'limit',
        limitWaits: 1,
        resumesAt: clock.now().plusMilliseconds(REQUEST_SETTINGS.limitWaitMs),
      });

      await work();

      expect(generator.requests).toHaveLength(1);

      generator.answer = resultOf('generated');
      clock.advance(REQUEST_SETTINGS.limitWaitMs);
      await work();

      const done = await read(id);
      expect(done.status).toBe('completed');
      expect(done.attempts).toHaveLength(1);
      expect(done.usage.attempts).toBe(1);
      expect(jobsOf(id).map(([status]) => status)).toEqual([
        'completed',
        'completed',
      ]);
    });
  });

  describe('when a person cancels before a worker took the job', () => {
    it('should end the improvement and its job, and start no work', async () => {
      const { work, module, generator } = await open();
      const { id } = await start();

      const cancelled = await module
        .get(CancelImprovementHandler)
        .execute({ improvementId: id });
      await work();

      expect(cancelled).toMatchObject({
        status: 'cancelled',
        waitingFor: null,
      });
      expect(generator.requests).toEqual([]);
      expect(jobsOf(id)).toEqual([['cancelled', null]]);
    });
  });

  it('should not start with settings that cannot work', async () => {
    const start = open({
      settings: { ...REQUEST_SETTINGS, testFileSuffixes: [], limitWaitMs: 0 },
      generatorSettings: {
        ...GENERATOR_TEST_SETTINGS,
        credential: { variable: 'a token', value: '' },
      },
    });

    await expect(start).rejects.toThrow(
      new InvalidImprovementSettingsError(
        'The settings of an improvement cannot work. ' +
          'testFileSuffixes: too_small, limitWaitMs: too_small, ' +
          'generator.credential.variable: invalid_format, ' +
          'generator.credential.value: too_small.',
      ),
    );
  });

  it('should not start when the budget and the billing disagree', async () => {
    const start = open({
      settings: {
        ...REQUEST_SETTINGS,
        generation: { ...REQUEST_SETTINGS.generation, maxCostUsd: 2 },
      },
    });

    await expect(start).rejects.toThrow(
      'generation.maxCostUsd: billing_mismatch',
    );
  });
});
