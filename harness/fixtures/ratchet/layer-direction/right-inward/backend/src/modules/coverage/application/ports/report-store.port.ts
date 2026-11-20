import { report } from '#coverage/domain/entities/report.entity';
import { clock } from '#ports/clock.port';

export const reportStore = [report, clock];
