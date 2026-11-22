import { reportStore } from '#coverage/application/ports/report-store.port';
import { reportDto } from '#coverage/application/contracts/report.dto';

export const handler = [reportStore, reportDto];
