import {
  type DynamicModule,
  Inject,
  type OnModuleDestroy,
} from '@nestjs/common';

import { SQLITE_CONNECTION } from '#infrastructure/database/sqlite-connection';
import { SqliteTransactionRunner } from '#infrastructure/database/sqlite-transaction-runner.adapter';
import { ID_GENERATOR } from '#kernel/id/id-generator';
import { CLOCK } from '#kernel/time/clock';
import { TRANSACTION_MANAGER } from '#ports/transaction-manager.port';
import { FixedClock } from '#tests/support/fixed-clock';
import { STORED_TIME } from '#tests/support/schema-rows';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';
import {
  createMigratedDatabase,
  type TemporaryDatabase,
} from '#tests/support/temporary-database';

const TEMPORARY_DATABASE = Symbol('TemporaryDatabase');

/**
 * The shared infrastructure a module of the service takes from outside,
 * over a migrated database in a temporary folder: the connection, the
 * transactions, a fixed clock and ids in sequence. The database goes
 * when the testing module closes.
 */
export class SharedTestModule implements OnModuleDestroy {
  private readonly database: TemporaryDatabase;

  public constructor(@Inject(TEMPORARY_DATABASE) database: TemporaryDatabase) {
    this.database = database;
  }

  public static create(): DynamicModule {
    const database = createMigratedDatabase();
    return {
      module: SharedTestModule,
      global: true,
      providers: [
        { provide: TEMPORARY_DATABASE, useValue: database },
        { provide: SQLITE_CONNECTION, useValue: database.connection },
        { provide: TRANSACTION_MANAGER, useClass: SqliteTransactionRunner },
        { provide: CLOCK, useValue: new FixedClock(STORED_TIME) },
        { provide: ID_GENERATOR, useValue: new SequentialIdGenerator() },
      ],
      exports: [SQLITE_CONNECTION, TRANSACTION_MANAGER, CLOCK, ID_GENERATOR],
    };
  }

  public onModuleDestroy(): void {
    this.database.remove();
  }
}
