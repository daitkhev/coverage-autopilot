import { reportStore } from '#coverage/application/ports/report-store.port';
import { reportDto } from '#coverage/contracts/report.dto';

export const handler = [reportStore, reportDto];
