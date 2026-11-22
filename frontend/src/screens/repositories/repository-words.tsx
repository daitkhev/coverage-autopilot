import type { ProgressStep } from '@coverage-autopilot/api-contracts/progress';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type { Scan } from '@coverage-autopilot/api-contracts/scans';

import type { Fact } from '#components/fact-line';
import {
  ageWords,
  durationWords,
  elapsedMs,
  isOlderThan,
  STALE_AFTER_MS,
} from '#theme/moments';
import { shortHash } from '#theme/names';
import type { Role } from '#theme/roles';
import type { GlyphName } from '#theme/symbols';

/** What is known of a repository, which its symbol says. */
export type RowState = 'scanning' | 'outdated' | 'scanned' | 'unscanned';

/** A state has a symbol of its own, so it reads without colour too. */
export const ROW_LOOKS: Readonly<
  Record<RowState, { readonly glyph: GlyphName; readonly role: Role }>
> = {
  scanning: { glyph: 'spinner', role: 'running' },
  outdated: { glyph: 'attention', role: 'warning' },
  scanned: { glyph: 'on', role: 'success' },
  unscanned: { glyph: 'notStarted', role: 'secondary' },
};

/** The steps of a scan in plain words. A step the client does not know is said by its code. */
const STEP_WORDS: ReadonlyMap<string, string> = new Map([
  ['clone', 'cloning'],
  ['install', 'installing the packages'],
  ['test_run', 'running the tests'],
  ['read_report', 'reading the report'],
]);

/** A scan runs, or this screen started one the list does not show yet. */
export function isScanning(
  row: { readonly repository: Repository },
  starting: ReadonlySet<string>,
): boolean {
  return (
    row.repository.activeScanId !== null || starting.has(row.repository.id)
  );
}

/**
 * A scan this screen started counts as running until the list knows it,
 * so the row says so at once.
 */
export function rowStateOf({
  repository,
  starting,
}: {
  readonly repository: Repository;
  readonly starting: boolean;
}): RowState {
  if (starting || repository.activeScanId !== null) {
    return 'scanning';
  }
  if (repository.latestSnapshot === null) {
    return 'unscanned';
  }
  return repository.outdated ? 'outdated' : 'scanned';
}

/**
 * The place of the step a scan is at: the one that runs, else the next
 * one to run, else the last one, whose end the scan waits for.
 */
export function stepAt(steps: readonly ProgressStep[]): number {
  const running = steps.findIndex((step) => step.status === 'running');
  if (running !== -1) {
    return running;
  }
  const pending = steps.findIndex((step) => step.status === 'pending');
  return pending === -1 ? steps.length - 1 : pending;
}

function stepWords(steps: readonly ProgressStep[]): string {
  const step = steps[stepAt(steps)];
  return step === undefined
    ? 'scanning'
    : (STEP_WORDS.get(step.code) ?? step.code);
}

/** Progress that has not moved for a while is marked, not hidden. */
function freshnessFact(updatedAt: string, now: string): Fact {
  const text = `updated ${ageWords(updatedAt, now)} ago`;
  return isOlderThan(updatedAt, now, STALE_AFTER_MS)
    ? { text, role: 'warning', glyph: { name: 'attention', role: 'warning' } }
    : { text };
}

function scanFacts(scan: Scan | undefined, now: string): Fact[] {
  const progress = scan?.progress ?? null;
  if (scan === undefined || progress === null) {
    return [{ text: 'a scan waits for its turn' }];
  }
  return [
    { text: stepWords(progress.steps) },
    { text: durationWords(elapsedMs(scan.startedAt ?? scan.queuedAt, now)) },
    freshnessFact(progress.updatedAt, now),
  ];
}

/** The branch and the latest snapshot: its commit and its age. */
function snapshotFacts(repository: Repository, now: string): Fact[] {
  const { latestSnapshot, outdated, defaultBranch } = repository;
  if (latestSnapshot === null) {
    return [{ text: defaultBranch }, { text: 'press s to scan' }];
  }
  const commit = shortHash(latestSnapshot.commitSha);
  return [
    { text: defaultBranch },
    { text: commit },
    outdated
      ? {
          text: `outdated: ${defaultBranch} moved since the scan`,
          role: 'warning',
        }
      : { text: `scanned ${ageWords(latestSnapshot.capturedAt, now)} ago` },
  ];
}

/**
 * The first line of the panel of a repository: as its row says, but a
 * repository never scanned says when it was connected, since the panel
 * names the key to scan it below.
 */
export function detailFacts(
  row: { readonly repository: Repository; readonly scan: Scan | undefined },
  { state, now }: { readonly state: RowState; readonly now: string },
): Fact[] {
  const { repository } = row;
  return state === 'unscanned'
    ? [
        { text: repository.defaultBranch },
        { text: `connected ${ageWords(repository.connectedAt, now)} ago` },
      ]
    : rowFacts(row, { state, now });
}

/**
 * The second line of a row: the branch, then the scan that runs with
 * its step, the time passed and how fresh that is, or the snapshot.
 */
export function rowFacts(
  {
    repository,
    scan,
  }: { readonly repository: Repository; readonly scan: Scan | undefined },
  { state, now }: { readonly state: RowState; readonly now: string },
): Fact[] {
  return state === 'scanning'
    ? [{ text: repository.defaultBranch }, ...scanFacts(scan, now)]
    : snapshotFacts(repository, now);
}
