import { reportStore } from '#coverage/application/ports/report-store.port';
import { report } from '#coverage/domain/entities/report.entity';
import { openDatabase } from '#infrastructure/database/open-database';

export const repository = [reportStore, report, openDatabase];
