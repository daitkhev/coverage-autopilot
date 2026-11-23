import type { Finding } from '#harness/architecture/finding';
import { workspaceOf } from '#harness/architecture/places';
import type { Project, Rule } from '#harness/architecture/project';
import type { Structure } from '#harness/shared/structure';

const ID = 'test-placement';
const TESTS = 'tests/';
const SOURCE = 'src/';

/** A test of a workspace: where it is, and what its name ends with. */
interface TestFile {
  readonly workspace: string;
  /** The path inside the workspace. */
  readonly inside: string;
  readonly suffix: string;
}

function testFileOf(path: string, structure: Structure): TestFile | undefined {
  const workspace = workspaceOf(path, structure);
  const suffix = structure.tests.suffixes.find((end) => path.endsWith(end));
  const excluded = structure.excluded.some((prefix) => path.startsWith(prefix));
  if (workspace === undefined || suffix === undefined || excluded) {
    return undefined;
  }
  return { workspace, inside: path.slice(workspace.length + 1), suffix };
}

/** The source file a mirrored test stands for, by each extension it may have. */
function sourcesOf(
  test: TestFile,
  kind: string,
  structure: Structure,
): string[] {
  const from = `${TESTS}${kind}/`.length;
  const name = test.inside.slice(from, -test.suffix.length);
  return structure.extensions.map(
    (extension) => `${test.workspace}/${SOURCE}${name}${extension}`,
  );
}

function mirrorProblem(
  test: TestFile,
  structure: Structure,
  paths: ReadonlySet<string>,
): string {
  const sources = sourcesOf(test, structure.tests.mirrored, structure);
  return sources.some((source) => paths.has(source))
    ? ''
    : `A ${structure.tests.mirrored} test repeats the path of its source ` +
        `file, and ${sources[0] ?? ''} is not there.`;
}

/** What is wrong with the place of a test, or an empty text. */
function problemOf(
  test: TestFile,
  structure: Structure,
  paths: ReadonlySet<string>,
): string {
  const { kinds, mirrored, support } = structure.tests;
  const [top, kind = ''] = test.inside.split('/');
  if (`${top ?? ''}/` !== TESTS) {
    return `A test is kept under ${TESTS}, away from the source.`;
  }
  if (kind === support) {
    return `${TESTS}${support}/ holds what tests share, and no test.`;
  }
  if (!kinds.includes(kind)) {
    return (
      `A test is of one kind: ${kinds.join(', ')}. ` +
      `Each kind has its folder under ${TESTS}.`
    );
  }
  return kind === mirrored ? mirrorProblem(test, structure, paths) : '';
}

function check(project: Project, structure: Structure): Finding[] {
  const paths = new Set(project.paths);
  return project.paths.flatMap((path) => {
    const test = testFileOf(path, structure);
    const detail = test === undefined ? '' : problemOf(test, structure, paths);
    return detail === '' ? [] : [{ rule: ID, path, line: 1, detail }];
  });
}

/**
 * A test of a workspace is where the gate looks for it. The gate runs the
 * folders of the kinds, so a test anywhere else would never run. A unit
 * test is found by the path of the file it tests.
 */
export function testPlacement(structure: Structure): Rule {
  return { id: ID, check: (project) => check(project, structure) };
}
