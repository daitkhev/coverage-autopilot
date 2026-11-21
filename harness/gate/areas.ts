import type { Structure } from '#harness/shared/structure';

/** The kinds of tests the gate runs on every change, and counts. */
export const TEST_KINDS = ['unit', 'integration'] as const;

type TestKind = (typeof TEST_KINDS)[number];

/**
 * A part of the tree that is tested and measured on its own: the harness,
 * or one workspace. Coverage is held at the floors in each of them, so
 * the tests of one part do not pay for another.
 */
export interface Area {
  readonly name: string;
  /** The folder of its source, from the root of the tree. */
  readonly source: string;
  /** The folder of its tests. */
  readonly tests: string;
  /** Folders under the source that are not source, and are not measured. */
  readonly leftOut: readonly string[];
}

/** The harness keeps its tests beside its code, under its own folder. */
const HARNESS: Area = {
  name: 'harness',
  source: 'harness/',
  tests: 'harness/tests/',
  leftOut: ['harness/tests/'],
};

/** The harness first, then every workspace of the policy by its name. */
export function areasOf(structure: Structure): Area[] {
  const workspaces = [...structure.workspaces.keys()].sort();
  return [
    HARNESS,
    ...workspaces.map((name) => ({
      name,
      source: `${name}/src/`,
      tests: `${name}/tests/`,
      leftOut: [],
    })),
  ];
}

/** Where the tests of one kind are, in every area. */
export function testFolders(areas: readonly Area[], kind: TestKind): string[] {
  return areas.map((area) => `${area.tests}${kind}`);
}
