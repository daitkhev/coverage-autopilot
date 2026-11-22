import type { ImprovementDto } from '#improvement/application/dto/improvement.dto';
import type { BudgetRequest } from '#improvement/domain/value-objects/budget-settings.vo';
import type { GeneratorConfigProps } from '#improvement/domain/value-objects/generator-config.vo';
import type { ImprovementMode } from '#improvement/domain/value-objects/improvement-mode.vo';
import type { QualityPolicyProps } from '#improvement/domain/value-objects/quality-policy.vo';

/**
 * Raise the coverage of one file of a snapshot, as the route parsed the
 * request. A choice left out is filled from the settings of the service.
 * The prompt and who pays always come from the settings.
 */
export interface StartImprovementCommand {
  /** The key the client made for this command, from its header. */
  readonly requestKey: string;
  readonly snapshotId: string;
  readonly filePath: string;
  readonly mode?: ImprovementMode;
  readonly budget?: BudgetRequest;
  readonly qualityPolicy?: QualityPolicyProps;
  readonly generator?: Pick<GeneratorConfigProps, 'cli' | 'model'>;
}

/**
 * Refused before any improvement is made: a value of the request breaks
 * a rule, such as a budget above the maximum, or the snapshot it names is
 * not there, did not measure the file, or the file changed on the default
 * branch since.
 */
type RequestRefusalReason =
  | 'invalid_request'
  | 'snapshot_not_found'
  | 'target_not_measured'
  | 'stale_snapshot';

/**
 * Refused because of earlier work: the key was used for other work, the
 * same work was asked for under another key, or the file is being
 * improved by another request.
 */
export type ConflictReason =
  'request_key_reused' | 'work_already_requested' | 'improvement_in_progress';

/** A refusal with a stable code and a sentence for people. */
export type StartRefusal =
  | {
      readonly outcome: 'refused';
      readonly reason: RequestRefusalReason;
      readonly message: string;
    }
  | {
      readonly outcome: 'refused';
      readonly reason: ConflictReason;
      readonly message: string;
      /** The earlier improvement, so the client can open it. */
      readonly improvementId: string;
    };

/**
 * `created`: a new improvement, and its job is queued. `existing`: the
 * improvement made before under the same key for the same work, whatever
 * its status.
 */
export type StartImprovementResult =
  | {
      readonly outcome: 'created' | 'existing';
      readonly improvement: ImprovementDto;
    }
  | StartRefusal;
