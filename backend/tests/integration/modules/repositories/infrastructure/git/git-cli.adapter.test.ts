import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import type { RevisionRequest } from '#repositories/application/ports/git.port';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { ToolFailedError } from '#repositories/infrastructure/errors/tool-failed.error';
import { UnexpectedToolOutputError } from '#repositories/infrastructure/errors/unexpected-tool-output.error';
import { GitCli } from '#repositories/infrastructure/git/git-cli.adapter';
import { MirrorTurns } from '#repositories/infrastructure/git/mirror-turns';
import type { RepositoriesSettings } from '#repositories/infrastructure/repositories-settings';
import { RecordingLogger } from '#tests/support/recording-logger';
import {
  SECRET_TOKEN,
  TemporaryCodeHost,
} from '#tests/support/temporary-code-host';
import { TOOL_CLOCK } from '#tests/support/tool-lines';

const WIDGETS = 'acme/widgets';
const URL_OF_WIDGETS = RepositoryUrl.parse(TemporaryCodeHost.urlOf(WIDGETS));
const MAIN = BranchName.create('main');
const REPOSITORY_ID = RepositoryId.create(
  '00000000-0000-4000-8000-000000000001',
);
const NEVER = new AbortController().signal;

let host: TemporaryCodeHost;
let git: GitCli;

/** git with the settings, whose lines no test of this file reads. */
function gitOf(settings: RepositoriesSettings): GitCli {
  return new GitCli(
    settings,
    new RecordingLogger(),
    TOOL_CLOCK,
    new MirrorTurns(),
  );
}

/**
 * Settings whose git is Node running a script of the test. After `--`,
 * an argument such as `--version` goes to the script and not to Node.
 */
function withScript(script: string): RepositoriesSettings {
  return {
    ...host.settings,
    git: {
      ...host.settings.git,
      command: [process.execPath, '--eval', script, '--'],
    },
  };
}

function revisionOf(snapshot: string, file = 'src/a.ts'): RevisionRequest {
  return {
    repositoryId: REPOSITORY_ID,
    url: URL_OF_WIDGETS,
    branch: MAIN,
    snapshotCommit: CommitSha.create(snapshot),
    targetFile: FilePath.create(file),
  };
}

beforeEach(() => {
  host = new TemporaryCodeHost();
  git = gitOf(host.settings);
});

afterEach(() => {
  host.remove();
});

describe('GitCli', () => {
  describe('version', () => {
    it('should find git and give its version', async () => {
      const found = await git.version(NEVER);

      expect(found).toMatchObject({ outcome: 'found' });
      expect(found.outcome === 'found' && found.version).toMatch(
        /^git version /u,
      );
    });

    describe('when no git is on the path it was given', () => {
      it('should answer missing', async () => {
        const settings = {
          ...host.settings,
          git: { ...host.settings.git, command: ['no-such-git-of-the-test'] },
        };

        expect(await gitOf(settings).version(NEVER)).toEqual({
          outcome: 'missing',
        });
      });
    });

    describe('when git fails', () => {
      it('should throw ToolFailedError', async () => {
        await expect(
          gitOf(withScript('process.exitCode = 2')).version(NEVER),
        ).rejects.toThrow(ToolFailedError);
      });
    });
  });

  describe('readDefaultBranch', () => {
    it('should read the branch the head of the repository names', async () => {
      host.createRepository(WIDGETS, { 'README.md': 'widgets\n' });

      const read = await git.readDefaultBranch(URL_OF_WIDGETS, NEVER);

      expect(read.outcome === 'read' && read.branch.value).toBe('main');
    });

    it('should read a default branch of another name', async () => {
      host.createRepository(WIDGETS, { 'README.md': 'widgets\n' });
      host.commit(WIDGETS, {}, { branch: 'trunk' });
      host.git(
        host.remoteOf(WIDGETS),
        'symbolic-ref',
        'HEAD',
        'refs/heads/trunk',
      );

      const read = await git.readDefaultBranch(URL_OF_WIDGETS, NEVER);

      expect(read.outcome === 'read' && read.branch.value).toBe('trunk');
    });

    describe('when the host has no such repository', () => {
      it('should answer refused with what git said', async () => {
        const read = await git.readDefaultBranch(URL_OF_WIDGETS, NEVER);

        expect(read).toMatchObject({ outcome: 'refused' });
        expect(read.outcome === 'refused' && read.output).toContain(
          'does not appear to be a git repository',
        );
      });
    });

    describe('when the repository names no branch', () => {
      it('should answer refused with the reason', async () => {
        const read = await gitOf(withScript('')).readDefaultBranch(
          URL_OF_WIDGETS,
          NEVER,
        );

        expect(read).toEqual({
          outcome: 'refused',
          output:
            'The repository names no default branch. It may have no commit yet.',
        });
      });
    });

    describe('when git prints a secret of its environment', () => {
      it('should hide it in the answer it keeps', async () => {
        const read = await gitOf(
          withScript(
            'console.error(process.env.GH_TOKEN); process.exitCode = 128',
          ),
        ).readDefaultBranch(URL_OF_WIDGETS, NEVER);

        expect(read).toEqual({ outcome: 'refused', output: '[hidden]' });
        expect(JSON.stringify(read)).not.toContain(SECRET_TOKEN);
      });
    });
  });

  describe('readBranchHead', () => {
    it('should read the commit of the branch on the host', async () => {
      const commit = host.createRepository(WIDGETS, { 'a.txt': 'a\n' });

      const read = await git.readBranchHead(
        { url: URL_OF_WIDGETS, branch: MAIN },
        NEVER,
      );

      expect(read.outcome === 'read' && read.commit.value).toBe(commit);
    });

    it('should read the branch itself, not a longer one that ends alike', async () => {
      host.createRepository(WIDGETS, { 'a.txt': 'a\n' });
      const commit = host.commit(
        WIDGETS,
        { 'b.txt': 'b\n' },
        {
          branch: 'feature/main',
        },
      );

      const read = await git.readBranchHead(
        { url: URL_OF_WIDGETS, branch: BranchName.create('feature/main') },
        NEVER,
      );

      expect(read.outcome === 'read' && read.commit.value).toBe(commit);
    });

    it('should answer absent for a branch the host does not have', async () => {
      host.createRepository(WIDGETS, { 'a.txt': 'a\n' });

      const read = await git.readBranchHead(
        { url: URL_OF_WIDGETS, branch: BranchName.create('coverage/a') },
        NEVER,
      );

      expect(read).toEqual({ outcome: 'absent' });
    });

    describe('when the host has no such repository', () => {
      it('should answer refused', async () => {
        const read = await git.readBranchHead(
          { url: URL_OF_WIDGETS, branch: MAIN },
          NEVER,
        );

        expect(read).toMatchObject({ outcome: 'refused' });
      });
    });

    describe('when git prints what is not a ref', () => {
      it('should throw UnexpectedToolOutputError', async () => {
        await expect(
          gitOf(
            withScript('process.stdout.write("zzz\\trefs/heads/main\\n")'),
          ).readBranchHead({ url: URL_OF_WIDGETS, branch: MAIN }, NEVER),
        ).rejects.toThrow(UnexpectedToolOutputError);
      });
    });
  });

  describe('compareRevisions', () => {
    it('should find the snapshot at the head', async () => {
      const snapshot = host.createRepository(WIDGETS, { 'src/a.ts': '1\n' });

      const facts = await git.compareRevisions(revisionOf(snapshot), NEVER);

      expect(facts).toEqual({
        headCommit: CommitSha.create(snapshot),
        snapshotIsAncestor: true,
        targetFileChanged: false,
      });
    });

    it('should see that the head moved and the file did not change', async () => {
      const snapshot = host.createRepository(WIDGETS, { 'src/a.ts': '1\n' });
      const head = host.commit(WIDGETS, { 'src/b.ts': '2\n' });

      const facts = await git.compareRevisions(revisionOf(snapshot), NEVER);

      expect(facts).toEqual({
        headCommit: CommitSha.create(head),
        snapshotIsAncestor: true,
        targetFileChanged: false,
      });
    });

    it('should see that the file changed since the snapshot', async () => {
      const snapshot = host.createRepository(WIDGETS, { 'src/a.ts': '1\n' });
      host.commit(WIDGETS, { 'src/a.ts': '2\n' });

      const facts = await git.compareRevisions(revisionOf(snapshot), NEVER);

      expect(facts).toMatchObject({ targetFileChanged: true });
    });

    it('should see a file that was removed as changed', async () => {
      const snapshot = host.createRepository(WIDGETS, { 'src/a.ts': '1\n' });
      host.commit(WIDGETS, { 'src/a.ts': null, 'src/b.ts': '1\n' });

      const facts = await git.compareRevisions(revisionOf(snapshot), NEVER);

      expect(facts).toMatchObject({ targetFileChanged: true });
    });

    it('should take a path with the characters of a pattern literally', async () => {
      const snapshot = host.createRepository(WIDGETS, {
        'src/[a].ts': '1\n',
        'src/a.ts': '1\n',
      });
      host.commit(WIDGETS, { 'src/a.ts': '2\n' });

      const facts = await git.compareRevisions(
        revisionOf(snapshot, 'src/[a].ts'),
        NEVER,
      );

      expect(facts).toMatchObject({ targetFileChanged: false });
    });

    it('should find a snapshot that the head no longer descends from', async () => {
      const first = host.createRepository(WIDGETS, { 'src/a.ts': '1\n' });
      const snapshot = host.commit(WIDGETS, { 'src/a.ts': '2\n' });
      await git.compareRevisions(revisionOf(snapshot), NEVER);
      const head = host.commit(
        WIDGETS,
        { 'src/c.ts': '3\n' },
        { parent: first },
      );

      const facts = await git.compareRevisions(revisionOf(snapshot), NEVER);

      expect(facts).toEqual({
        headCommit: CommitSha.create(head),
        snapshotIsAncestor: false,
      });
    });

    it('should find a snapshot commit the host never had', async () => {
      host.createRepository(WIDGETS, { 'src/a.ts': '1\n' });

      const facts = await git.compareRevisions(
        revisionOf('c'.repeat(40)),
        NEVER,
      );

      expect(facts).toMatchObject({ snapshotIsAncestor: false });
    });

    describe('when the host cannot be read', () => {
      it('should throw ToolFailedError', async () => {
        await expect(
          git.compareRevisions(revisionOf('c'.repeat(40)), NEVER),
        ).rejects.toThrow(ToolFailedError);
      });
    });
  });
});
