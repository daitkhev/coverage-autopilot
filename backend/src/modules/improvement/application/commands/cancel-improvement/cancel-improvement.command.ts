import type { ImprovementDto } from '#improvement/application/dto/improvement.dto';

/** A person stops an improvement, whatever it is doing. */
export interface CancelImprovementCommand {
  readonly improvementId: string;
}

/**
 * `cancelled`: this command ended the improvement and its jobs. `ended`:
 * it had ended already, by a cancel or otherwise, and is given as it is,
 * so cancelling twice is no error.
 */
export interface CancelImprovementResult {
  readonly outcome: 'cancelled' | 'ended';
  readonly improvement: ImprovementDto;
}
