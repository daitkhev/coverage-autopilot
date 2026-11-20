import { start } from '#improvement/application/commands/start.handler';
import { verificationModule } from '#verification/verification.module';

export const improvementModule = [start, verificationModule];
