import type {
  CopyApplyResult,
  CopyPatchResult,
  CreateCopyRequest,
  PushRequest,
  PushResult,
  WorkingCopies,
} from '#repositories/application/ports/working-copies.port';
import type { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';

/** The working copies in memory: answers of a test, and each call. */
export class ScriptedWorkingCopies implements WorkingCopies {
  public readonly calls: string[] = [];
  public patchAnswer: CopyPatchResult = { outcome: 'empty' };
  public applyAnswer: CopyApplyResult = { outcome: 'applied', files: [] };
  public pushAnswer: PushResult = { outcome: 'pushed' };

  public create(request: CreateCopyRequest): Promise<string> {
    this.calls.push(
      `create ${request.id.value} of ${request.url.fullName} at ${request.commit.value}`,
    );
    return Promise.resolve(`/copies/${request.id.value}`);
  }

  public dispose(id: WorkingCopyId): Promise<void> {
    this.calls.push(`dispose ${id.value}`);
    return Promise.resolve();
  }

  public extractPatch(id: WorkingCopyId): Promise<CopyPatchResult> {
    this.calls.push(`extractPatch ${id.value}`);
    return Promise.resolve(this.patchAnswer);
  }

  public applyPatch(
    id: WorkingCopyId,
    patchText: string,
  ): Promise<CopyApplyResult> {
    this.calls.push(`applyPatch ${id.value}: ${patchText}`);
    return Promise.resolve(this.applyAnswer);
  }

  public commitAndPush(request: PushRequest): Promise<PushResult> {
    const { base } = request;
    const withBase =
      base === undefined
        ? ''
        : ` with ${base.branch.value} at ${base.commit.value}`;
    this.calls.push(
      `commitAndPush ${request.id.value} to ${request.url.fullName} ${request.branch.value}${withBase}: ${request.commitMessage}`,
    );
    return Promise.resolve(this.pushAnswer);
  }
}
