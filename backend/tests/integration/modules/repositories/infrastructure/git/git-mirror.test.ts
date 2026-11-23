import { setImmediate } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import {
  GitMirror,
  type MirrorRequest,
} from '#repositories/infrastructure/git/git-mirror';
import { hostGit } from '#repositories/infrastructure/git/git-tool-settings';
import { MirrorTurns } from '#repositories/infrastructure/git/mirror-turns';
import {
  type ToolCall,
  type ToolRun,
  ToolRunner,
} from '#repositories/infrastructure/tools/tool-runner';
import {
  SECRET_TOKEN,
  TemporaryCodeHost,
} from '#tests/support/temporary-code-host';
import { toolLogOf } from '#tests/support/tool-lines';

const WIDGETS = 'acme/widgets';
const NEVER = new AbortController().signal;

const REQUEST: MirrorRequest = {
  repositoryId: RepositoryId.create('00000000-0000-4000-8000-000000000001'),
  url: RepositoryUrl.parse(TemporaryCodeHost.urlOf(WIDGETS)),
  branch: BranchName.create('main'),
};

/**
 * git that holds every fetch at a gate until the test opens it, and
 * counts each fetch that began while another one was still running.
 */
class GatedGit extends ToolRunner {
  public overlaps = 0;
  public held = 0;
  private running = 0;
  private gate = Promise.withResolvers<undefined>();

  public close(): void {
    this.gate = Promise.withResolvers<undefined>();
  }

  public open(): void {
    this.gate.resolve(undefined);
  }

  public override async run(
    call: ToolCall,
    signal: AbortSignal,
  ): Promise<ToolRun> {
    if (!call.arguments.includes('fetch')) {
      return super.run(call, signal);
    }
    this.overlaps += this.running > 0 ? 1 : 0;
    this.running += 1;
    this.held += 1;
    try {
      await this.gate.promise;
      this.held -= 1;
      return await super.run(call, signal);
    } finally {
      this.running -= 1;
    }
  }
}

let host: TemporaryCodeHost;
let git: GatedGit;
let turns: MirrorTurns;

/**
 * Each adapter that reaches the mirrors holds a mirror of its own over
 * the same folders, as the adapter of git and that of the working copies
 * do in a service, and they share the turns of the service.
 */
function mirrorOf(): GitMirror {
  return new GitMirror(git, host.settings.workingCopiesRoot, turns);
}

beforeEach(() => {
  host = new TemporaryCodeHost();
  host.createRepository(WIDGETS, { 'src/a.ts': 'export const a = 1;\n' });
  git = new GatedGit({
    name: 'git',
    settings: hostGit(host.settings.git),
    secrets: [SECRET_TOKEN],
    log: toolLogOf(),
  });
  git.open();
  turns = new MirrorTurns();
});

afterEach(() => {
  git.open();
  host.remove();
});

describe('GitMirror', () => {
  describe('when the branch moved and two fetches of one mirror are asked at once', () => {
    it('should begin the second fetch only once the first has ended', async () => {
      await mirrorOf().fetchBranch(REQUEST, NEVER);
      const moved = CommitSha.create(
        host.commit(WIDGETS, { 'NOTES.md': 'moved\n' }),
      );
      git.close();

      const first = mirrorOf().fetchBranch(REQUEST, NEVER);
      await vi.waitFor(() => {
        expect(git.held).toBe(1);
      });
      const second = mirrorOf().fetchBranch(REQUEST, NEVER);
      // The mirror is there, so the second call does in memory all it
      // does before it would begin its fetch, which the gate would count.
      await setImmediate();
      const overlaps = git.overlaps;
      git.open();
      const settled = await Promise.allSettled([first, second]);

      expect(overlaps).toBe(0);
      expect(settled).toEqual([
        { status: 'fulfilled', value: moved },
        { status: 'fulfilled', value: moved },
      ]);
    });
  });
});
