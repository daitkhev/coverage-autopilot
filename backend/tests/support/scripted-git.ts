import { CommitSha } from '#kernel/primitives/commit-sha';
import type {
  BranchHeadResult,
  BranchRequest,
  DefaultBranchResult,
  Git,
  GitVersionResult,
  RevisionRequest,
} from '#repositories/application/ports/git.port';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import type { RevisionFacts } from '#repositories/domain/value-objects/revision-assessment.vo';

const SHA1_DIGITS = 40;

/** The head every scripted branch is at unless a test says otherwise. */
export const SCRIPTED_HEAD = CommitSha.create('b'.repeat(SHA1_DIGITS));

/** `git` in memory: it answers what a test set and records each call. */
export class ScriptedGit implements Git {
  public readonly calls: string[] = [];
  public versionAnswer: GitVersionResult = {
    outcome: 'found',
    version: 'git version 2.50.1',
  };
  public defaultBranchAnswer: DefaultBranchResult = {
    outcome: 'read',
    branch: BranchName.create('main'),
  };
  /** Given first, one a call, before `defaultBranchAnswer`. */
  public readonly earlierDefaultBranchAnswers: DefaultBranchResult[] = [];
  /** By the name of the branch. A branch with no answer is absent. */
  public readonly branchHeads = new Map<string, BranchHeadResult>([
    ['main', { outcome: 'read', commit: SCRIPTED_HEAD }],
  ]);
  public facts: RevisionFacts = {
    headCommit: SCRIPTED_HEAD,
    snapshotIsAncestor: true,
    targetFileChanged: false,
  };

  public version(): Promise<GitVersionResult> {
    this.calls.push('version');
    return Promise.resolve(this.versionAnswer);
  }

  public readDefaultBranch(url: RepositoryUrl): Promise<DefaultBranchResult> {
    this.calls.push(`readDefaultBranch ${url.fullName}`);
    return Promise.resolve(
      this.earlierDefaultBranchAnswers.shift() ?? this.defaultBranchAnswer,
    );
  }

  public readBranchHead(request: BranchRequest): Promise<BranchHeadResult> {
    this.calls.push(`readBranchHead ${request.branch.value}`);
    return Promise.resolve(
      this.branchHeads.get(request.branch.value) ?? { outcome: 'absent' },
    );
  }

  public compareRevisions(request: RevisionRequest): Promise<RevisionFacts> {
    this.calls.push(
      `compareRevisions ${request.snapshotCommit.value} ${request.targetFile.value}`,
    );
    return Promise.resolve(this.facts);
  }
}
