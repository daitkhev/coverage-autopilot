import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import type { Budget } from '#improvement/domain/value-objects/budget.vo';
import type { GeneratorConfig } from '#improvement/domain/value-objects/generator-config.vo';
import {
  IMPROVEMENT_MODES,
  type ImprovementMode,
} from '#improvement/domain/value-objects/improvement-mode.vo';
import type { QualityPolicy } from '#improvement/domain/value-objects/quality-policy.vo';
import type { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import type { RequestKey } from '#improvement/domain/value-objects/request-key.vo';
import type { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import { ValueObject } from '#kernel/primitives/value-object';

export interface ImprovementRequestProps {
  readonly repositoryId: RepositoryId;
  /** The snapshot the request was made from. It names the base commit. */
  readonly sourceSnapshotId: SnapshotId;
  /** The commit of the source snapshot, which the patch is made on. */
  readonly baseCommit: CommitSha;
  readonly targetFile: FilePath;
  readonly mode: ImprovementMode;
  readonly key: RequestKey;
  readonly fingerprint: RequestFingerprint;
  readonly policy: QualityPolicy;
  readonly generator: GeneratorConfig;
  readonly budget: Budget;
}

/**
 * What an improvement was asked to do. It is fixed when the improvement
 * is created and never changes, so the fingerprint made from it stays
 * true for the whole life of the improvement.
 */
export class ImprovementRequest extends ValueObject<ImprovementRequestProps> {
  private constructor(props: ImprovementRequestProps) {
    super(props);
  }

  /**
   * Tokens have a limit with a key and none under a subscription, whose
   * own windows hold the generator. A key with no limit of tokens could
   * spend any amount of money, so it is refused.
   */
  public static create(props: ImprovementRequestProps): ImprovementRequest {
    const limited = props.budget.tokens !== null;
    const paysByKey = props.generator.billing === 'api_key';
    if (limited !== paysByKey || !IMPROVEMENT_MODES.includes(props.mode)) {
      throw new InvalidImprovementValueError(
        `An improvement in ${props.mode} mode paid by ` +
          `${props.generator.billing} cannot have a limit of ` +
          `${String(props.budget.tokens)} tokens: a known mode, and a ` +
          'limit of tokens with a key only.',
      );
    }
    return new ImprovementRequest(props);
  }

  public get repositoryId(): RepositoryId {
    return this.props.repositoryId;
  }

  public get sourceSnapshotId(): SnapshotId {
    return this.props.sourceSnapshotId;
  }

  public get baseCommit(): CommitSha {
    return this.props.baseCommit;
  }

  public get targetFile(): FilePath {
    return this.props.targetFile;
  }

  public get mode(): ImprovementMode {
    return this.props.mode;
  }

  public get key(): RequestKey {
    return this.props.key;
  }

  public get fingerprint(): RequestFingerprint {
    return this.props.fingerprint;
  }

  public get policy(): QualityPolicy {
    return this.props.policy;
  }

  public get generator(): GeneratorConfig {
    return this.props.generator;
  }

  public get budget(): Budget {
    return this.props.budget;
  }
}
