import {
  type DynamicModule,
  Inject,
  type OnModuleDestroy,
} from '@nestjs/common';

import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import { ID_GENERATOR } from '#kernel/id/id-generator';
import { CLOCK } from '#kernel/time/clock';
import { ALARM } from '#ports/alarm.port';
import { LOGGER } from '#ports/logger.port';
import { TRANSACTION_MANAGER } from '#ports/transaction-manager.port';
import { FixedClock } from '#tests/support/fixed-clock';
import { RecordingLogger } from '#tests/support/recording-logger';
import { STORED_TIME } from '#tests/support/schema-rows';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';
import { SteppingAlarm } from '#tests/support/stepping-alarm';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

const TEMPORARY_DATABASE = Symbol('TemporaryDatabase');

/**
 * The shared infrastructure a module of the service takes from outside,
 * over a migrated database in a temporary folder: the connection, the
 * transactions, a fixed clock with an alarm that moves it, ids in
 * sequence and a logger that keeps its lines. The database goes when the
 * testing module closes.
 */
export class SharedTestModule implements OnModuleDestroy {
  private readonly database: TemporaryDatabase;

  public constructor(@Inject(TEMPORARY_DATABASE) database: TemporaryDatabase) {
    this.database = database;
  }

  public static create(): DynamicModule {
    const database = createMigratedDatabase();
    const clock = new FixedClock(STORED_TIME);
    return {
      module: SharedTestModule,
      global: true,
      providers: [
        { provide: TEMPORARY_DATABASE, useValue: database },
        { provide: SQLITE_CONNECTION, useValue: database.connection },
        { provide: TRANSACTION_MANAGER, useClass: SqliteTransactionRunner },
        { provide: CLOCK, useValue: clock },
        { provide: ALARM, useValue: new SteppingAlarm(clock) },
        { provide: ID_GENERATOR, useValue: new SequentialIdGenerator() },
        { provide: LOGGER, useValue: new RecordingLogger() },
      ],
      exports: [
        SQLITE_CONNECTION,
        TRANSACTION_MANAGER,
        CLOCK,
        ALARM,
        ID_GENERATOR,
        LOGGER,
      ],
    };
  }

  public onModuleDestroy(): void {
    this.database.remove();
  }
}
