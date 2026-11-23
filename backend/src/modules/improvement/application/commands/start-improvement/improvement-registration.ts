import { Inject, Injectable } from '@nestjs/common';

import { runJobOf } from '#improvement/application/commands/run-improvement/improvement-jobs';
import type { StartRefusal } from '#improvement/application/commands/start-improvement/start-improvement.command';
import { conflictWith } from '#improvement/application/commands/start-improvement/start-refusals';
import { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  IMPROVEMENT_REPOSITORY,
  type ImprovementRepository,
} from '#improvement/domain/repositories/improvement.repository';
import { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import type { ImprovementRequest } from '#improvement/domain/value-objects/improvement-request.vo';
import { ID_GENERATOR, type IdGenerator } from '#kernel/id/id-generator';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type { Transaction } from '#kernel/transaction/transaction';
import { JOB_QUEUE, type JobQueue } from '#ports/job-queue.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#ports/transaction-manager.port';

/** The improvement a request is answered with, or why there is none. */
export type Registration =
  | {
      readonly outcome: 'created' | 'existing';
      readonly improvement: Improvement;
    }
  | StartRefusal;

/**
 * Registers a request in one write transaction. It looks for earlier work
 * by the key, by the work and by the file, reading with that transaction,
 * and only then inserts: the database has one writer, so nothing changes
 * between the look and the insert, and its indexes are only a safety net.
 * An improvement and the job that runs it are saved together.
 */
@Injectable()
export class ImprovementRegistration {
  private readonly improvements: ImprovementRepository;
  private readonly transactions: TransactionManager;
  private readonly queue: JobQueue;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  public constructor(
    @Inject(IMPROVEMENT_REPOSITORY) improvements: ImprovementRepository,
    @Inject(TRANSACTION_MANAGER) transactions: TransactionManager,
    @Inject(JOB_QUEUE) queue: JobQueue,
    @Inject(ID_GENERATOR) ids: IdGenerator,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.improvements = improvements;
    this.transactions = transactions;
    this.queue = queue;
    this.ids = ids;
    this.clock = clock;
  }

  public async register(request: ImprovementRequest): Promise<Registration> {
    return this.transactions.run(async (transaction) => {
      const earlier = await this.earlierWorkOf(request, transaction);
      return earlier ?? this.created(request, transaction);
    });
  }

  /**
   * The same key with the same work is the improvement made before; with
   * other work it is a conflict. Work that failed or was cancelled may be
   * asked for again, and a file is improved by one request at a time.
   */
  private async earlierWorkOf(
    request: ImprovementRequest,
    transaction: Transaction,
  ): Promise<Registration | null> {
    const { key, fingerprint } = request;
    const sameKey = await this.improvements.findByRequestKey(key, transaction);
    if (sameKey !== null) {
      return sameKey.request.fingerprint.equals(fingerprint)
        ? { outcome: 'existing', improvement: sameKey }
        : conflictWith('request_key_reused', sameKey);
    }
    const sameWork = await this.improvements.findActiveByFingerprint(
      fingerprint,
      transaction,
    );
    if (sameWork !== null) {
      return conflictWith('work_already_requested', sameWork);
    }
    const sameFile = await this.improvements.findOpenByTarget(
      request,
      transaction,
    );
    return sameFile === null
      ? null
      : conflictWith('improvement_in_progress', sameFile);
  }

  private async created(
    request: ImprovementRequest,
    transaction: Transaction,
  ): Promise<Registration> {
    const improvement = Improvement.create(
      ImprovementId.create(this.ids.generate()),
      request,
      this.clock.now(),
    );
    await this.improvements.insert(improvement, transaction);
    await this.queue.enqueue(runJobOf(improvement), transaction);
    return { outcome: 'created', improvement };
  }
}
