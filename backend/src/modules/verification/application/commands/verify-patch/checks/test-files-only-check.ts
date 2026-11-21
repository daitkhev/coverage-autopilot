import { Inject, Injectable } from '@nestjs/common';

import type { FilePath } from '#kernel/primitives/file-path';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/contracts/repositories-public-api';
import type { VerifyPatchCommand } from '#verification/application/commands/verify-patch/verify-patch.command';
import {
  appliedFilesProblemOf,
  testFilesOf,
} from '#verification/domain/services/test-files-only.service';
import {
  type CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';

/** The test files the text adds, or the result of a text that adds more. */
export type PatchReading =
  | { readonly outcome: 'test_files'; readonly files: readonly FilePath[] }
  | { readonly outcome: 'refused'; readonly result: CheckResult };

export interface PatchApplication {
  readonly workingCopyId: string;
  readonly patchText: string;
  /** The files the text adds, as the first half read them. */
  readonly files: readonly FilePath[];
}

/**
 * The first check, in two halves: on the text before anything is applied,
 * and on the files git wrote. A patch that fails the first half is never
 * applied.
 */
@Injectable()
export class TestFilesOnlyCheck {
  public readonly name: CheckName = 'test_files_only';
  private readonly repositories: RepositoriesPublicApi;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
  ) {
    this.repositories = repositories;
  }

  public read(command: VerifyPatchCommand): PatchReading {
    const reading = testFilesOf({
      text: command.patch.text,
      suffixes: command.testFileSuffixes,
    });
    return reading.outcome === 'refused'
      ? {
          outcome: 'refused',
          result: CheckResult.failed(this.name, reading.reason),
        }
      : reading;
  }

  public async apply(application: PatchApplication): Promise<CheckResult> {
    const applied = await this.repositories.applyPatch({
      workingCopyId: application.workingCopyId,
      patchText: application.patchText,
    });
    const problem =
      applied.outcome === 'refused'
        ? `git did not apply the patch: ${applied.reason.trim()}`
        : appliedFilesProblemOf({
            applied: applied.files,
            added: application.files,
          });
    return problem === null
      ? CheckResult.passed(this.name)
      : CheckResult.failed(this.name, problem);
  }
}
