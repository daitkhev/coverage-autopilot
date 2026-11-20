import { repository } from '#coverage/infrastructure/persistence/report.repository';
import { controller } from '#coverage/presentation/http/report.controller';

export const coverageModule = [repository, controller];
