import type { Finding } from '#harness/architecture/finding';
import { placeOf, workspaceOf } from '#harness/architecture/places';
import type {
  ImportRecord,
  Project,
  Rule,
  SourceFile,
} from '#harness/architecture/project';
import { chainFrom } from '#harness/architecture/reach';
import type { Structure } from '#harness/shared/structure';

const ID = 'unit-test-reach';
const NODE = 'node:';

type Files = ReadonlyMap<string, SourceFile>;

/** The imports that load something when the file runs. A type loads nothing. */
function loadedBy(file: SourceFile | undefined): readonly ImportRecord[] {
  return (file?.imports ?? []).filter((record) => !record.typeOnly);
}

/** Whether an import loads a module of Node that does I/O. */
function usesIo(record: ImportRecord, structure: Structure): boolean {
  const [module = ''] = record.specifier.slice(NODE.length).split('/');
  return (
    record.kind === 'builtin' && structure.tests.ioModules.includes(module)
  );
}

/** The module of Node that a file uses for I/O, when it uses one. */
function ioModuleOf(
  file: SourceFile | undefined,
  structure: Structure,
): string | undefined {
  return loadedBy(file).find((record) => usesIo(record, structure))?.specifier;
}

/** The layer of a module or the folder of the shared code a file is in. */
function layerOf(path: string, structure: Structure): string {
  const place = placeOf(path, structure.backend);
  if (place.kind === 'layer') {
    return place.layer;
  }
  return place.kind === 'shared' ? place.part : '';
}

/** What I/O a file is, or does itself, or nothing for a file of memory. */
function ioOf(path: string, files: Files, structure: Structure): string {
  if (structure.tests.ioLayers.includes(layerOf(path, structure))) {
    return 'a file of a layer that does I/O';
  }
  return ioModuleOf(files.get(path), structure) ?? '';
}

function isUnitTest(path: string, structure: Structure): boolean {
  const workspace = workspaceOf(path, structure);
  const { mirrored, suffixes } = structure.tests;
  return (
    workspace !== undefined &&
    path.startsWith(`${workspace}/tests/${mirrored}/`) &&
    suffixes.some((suffix) => path.endsWith(suffix))
  );
}

/** The chain from a test to the nearest file that does I/O, or none. */
function chainOf(
  test: SourceFile,
  files: Files,
  structure: Structure,
): string[] {
  const chain = chainFrom(
    test.path,
    (path) => loadedBy(files.get(path)).flatMap((r) => r.target ?? []),
    (path) => ioOf(path, files, structure) !== '',
  );
  return chain ?? [];
}

/**
 * The finding is on the import that starts the chain, in the test
 * itself: the import of the next file, or of the module when the test
 * does the I/O with its own hands.
 */
function findingsOf(
  test: SourceFile,
  files: Files,
  structure: Structure,
): Finding[] {
  const chain = chainOf(test, files, structure);
  const io = ioOf(chain.at(-1) ?? '', files, structure);
  const starts = (record: ImportRecord): boolean =>
    chain.length === 1 ? usesIo(record, structure) : record.target === chain[1];
  return loadedBy(test)
    .filter((record) => chain.length > 0 && starts(record))
    .slice(0, 1)
    .map((record) => ({
      rule: ID,
      path: test.path,
      line: record.line,
      detail:
        `A ${structure.tests.mirrored} test touches memory only. This one ` +
        `reaches ${io} through ${chain.join(' → ')}.`,
    }));
}

function check(project: Project, structure: Structure): Finding[] {
  const files = new Map(project.files.map((file) => [file.path, file]));
  return project.files
    .filter((file) => isUnitTest(file.path, structure))
    .flatMap((test) => findingsOf(test, files, structure));
}

/**
 * A unit test runs nothing that does I/O: no file of a layer that does,
 * and no module of Node that does, through any chain of imports. An
 * `import type` is not followed, because a type runs nothing.
 */
export function unitTestReach(structure: Structure): Rule {
  return { id: ID, check: (project) => check(project, structure) };
}
