import { join } from 'node:path';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import type { CreateCopyRequest } from '#repositories/application/ports/working-copies.port';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';
import { GitWorkingCopies } from '#repositories/infrastructure/git/git-working-copies.adapter';
import { MirrorTurns } from '#repositories/infrastructure/git/mirror-turns';
import type { RepositoriesSettings } from '#repositories/infrastructure/repositories-settings';
import { RecordingLogger } from '#tests/support/recording-logger';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';
import { TOOL_CLOCK } from '#tests/support/tool-lines';

export const WIDGETS = 'acme/widgets';

/** The copy most tests work on. */
export const COPY = WorkingCopyId.fromPurpose('scan:1');

/** The copy a patch for another one is taken from. */
const SOURCE = WorkingCopyId.fromPurpose('source');

const REPOSITORY_ID = RepositoryId.create(
  '00000000-0000-4000-8000-000000000001',
);
const NEVER = new AbortController().signal;

/**
 * `acme/widgets` on a temporary host with a first commit of two source
 * files and an ignored folder, and the working copies made from it.
 */
export class WorkingCopyFixture {
  public readonly host = new TemporaryCodeHost();
  /** Where the copies say what they could not do. */
  public readonly logger = new RecordingLogger();
  public readonly copies = this.copiesWith(this.host.settings);
  public readonly url = RepositoryUrl.parse(TemporaryCodeHost.urlOf(WIDGETS));
  public readonly first = this.host.createRepository(WIDGETS, {
    '.gitignore': 'coverage/\n',
    'src/a.ts': 'export const a = 1;\n',
    'src/b.ts': 'export const b = 2;\n',
  });

  public requestFor(commit = this.first, id = COPY): CreateCopyRequest {
    return {
      id,
      repositoryId: REPOSITORY_ID,
      url: this.url,
      branch: BranchName.create('main'),
      commit: CommitSha.create(commit),
    };
  }

  /** Copies with other settings, which log to the same logger. */
  public copiesWith(settings: RepositoriesSettings): GitWorkingCopies {
    return new GitWorkingCopies(
      settings,
      this.logger,
      TOOL_CLOCK,
      new MirrorTurns(),
    );
  }

  /** A copy at the commit, the first one unless named, and its path. */
  public async created(commit = this.first, id = COPY): Promise<string> {
    return this.copies.create(this.requestFor(commit, id), NEVER);
  }

  /** Where the copy of an id is, whether it is there or not. */
  public pathOf(id = COPY): string {
    return join(this.host.settings.workingCopiesRoot, 'copies', id.value);
  }

  /** Where the git directory of the copy of an id is, outside its tree. */
  public gitDirOf(id = COPY): string {
    return join(this.host.settings.workingCopiesRoot, 'git-dirs', id.value);
  }

  /** Runs git of the host on the copy of an id and gives its output. */
  public gitIn(id: WorkingCopyId, ...args: string[]): string {
    return this.host.git(
      this.pathOf(id),
      `--git-dir=${this.gitDirOf(id)}`,
      `--work-tree=${this.pathOf(id)}`,
      ...args,
    );
  }

  /** The patch of the changes a test makes in a copy of its own. */
  public async patchOf(change: (path: string) => void): Promise<string> {
    change(await this.created(this.first, SOURCE));
    const extracted = await this.copies.extractPatch(SOURCE);
    return extracted.outcome === 'extracted' ? extracted.patch.text : '';
  }

  public remove(): void {
    this.host.remove();
  }
}
