import type { CoverageSnapshotDto } from '#coverage/contracts/coverage-public-api';
import type { StartImprovementCommand } from '#improvement/application/commands/start-improvement/start-improvement.command';
import type { ImprovementSettings } from '#improvement/application/improvement-settings';
import type { Budget } from '#improvement/domain/value-objects/budget.vo';
import { GeneratorConfig } from '#improvement/domain/value-objects/generator-config.vo';
import type { ImprovementMode } from '#improvement/domain/value-objects/improvement-mode.vo';
import { ImprovementRequest } from '#improvement/domain/value-objects/improvement-request.vo';
import {
  CHECK_NAMES,
  QualityPolicy,
} from '#improvement/domain/value-objects/quality-policy.vo';
import type { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import { RequestKey } from '#improvement/domain/value-objects/request-key.vo';
import { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import { FilePath } from '#kernel/primitives/file-path';

/**
 * What a command asks for, as values the domain checked, with every
 * choice it left out filled from the settings.
 */
export interface AskedImprovement {
  readonly key: RequestKey;
  readonly snapshotId: SnapshotId;
  readonly targetFile: FilePath;
  readonly mode: ImprovementMode;
  readonly budget: Budget;
  readonly policy: QualityPolicy;
  readonly generator: GeneratorConfig;
}

/** The repository and the commit the snapshot names, which the work is on. */
export type SourceOfWork = Pick<CoverageSnapshotDto, 'repositoryId' | 'commit'>;

/**
 * A request may choose the CLI and the model. The prompt and who pays
 * are the service's own, whatever the request says.
 */
function generatorOf(
  command: StartImprovementCommand,
  settings: ImprovementSettings,
): GeneratorConfig {
  const chosen = command.generator;
  return chosen === undefined
    ? settings.generator
    : GeneratorConfig.create({
        cli: chosen.cli,
        model: chosen.model,
        promptVersion: settings.generator.promptVersion,
        billing: settings.generator.billing,
      });
}

/** A value the domain refuses throws its error here, before any call. */
export function askedImprovementOf(
  command: StartImprovementCommand,
  settings: ImprovementSettings,
): AskedImprovement {
  const { qualityPolicy } = command;
  return {
    key: RequestKey.create(command.requestKey),
    snapshotId: SnapshotId.create(command.snapshotId),
    targetFile: FilePath.create(command.filePath),
    mode: command.mode ?? settings.mode,
    budget: settings.budget.fill(command.budget ?? {}),
    policy:
      qualityPolicy === undefined
        ? settings.policy
        : QualityPolicy.create(qualityPolicy),
    generator: generatorOf(command, settings),
  };
}

/**
 * The text the fingerprint is made of: the work a request asks for, with
 * its keys in a fixed order and the checks in the order they run. The
 * key, the budget and the mode do not change what the work is, and
 * neither does who pays.
 */
export function canonicalTextOf(
  asked: AskedImprovement,
  source: SourceOfWork,
): string {
  const { policy, generator } = asked;
  return JSON.stringify({
    repositoryId: source.repositoryId.value,
    baseCommit: source.commit.value,
    targetFile: asked.targetFile.value,
    qualityPolicy: {
      requiredChecks: CHECK_NAMES.filter((check) =>
        policy.requiredChecks.includes(check),
      ),
      repeatedRuns: policy.repeatedRuns,
      mutationThreshold: policy.mutationThreshold,
    },
    generator: {
      cli: generator.cli,
      model: generator.model,
      promptVersion: generator.promptVersion,
    },
  });
}

/** The request an improvement is created with, once its source is known. */
export function improvementRequestOf(
  asked: AskedImprovement,
  source: SourceOfWork,
  fingerprint: RequestFingerprint,
): ImprovementRequest {
  return ImprovementRequest.create({
    repositoryId: source.repositoryId,
    sourceSnapshotId: asked.snapshotId,
    baseCommit: source.commit,
    targetFile: asked.targetFile,
    mode: asked.mode,
    key: asked.key,
    fingerprint,
    policy: asked.policy,
    generator: asked.generator,
    budget: asked.budget,
  });
}
