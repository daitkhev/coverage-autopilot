import type { Finding } from '#harness/architecture/finding';
import type {
  ImportRecord,
  Project,
  Rule,
  SourceFile,
} from '#harness/architecture/project';
import { chainFrom } from '#harness/architecture/reach';
import type { Frontend } from '#harness/shared/structure';

const ID = 'client-direction';

/** A chain of one import is a plain import, and the table judges it. */
const SHORTEST_CHAIN = 3;

type Files = ReadonlyMap<string, SourceFile>;

/** Where a file is in the client: its folder, and its part of the folder. */
interface Spot {
  /** The folder under the source. A file at the root has none. */
  readonly folder: string;
  /** The first name under the folder: a file, or a folder of its own. */
  readonly part: string;
}

function spotOf(path: string, frontend: Frontend): Spot | undefined {
  if (!path.startsWith(frontend.source)) {
    return undefined;
  }
  const [first = '', second] = path.slice(frontend.source.length).split('/');
  return second === undefined
    ? { folder: '', part: first }
    : { folder: first, part: second };
}

function nameOf(spot: Spot): string {
  return spot.folder === '' ? 'A file at the root' : `${spot.folder}/`;
}

function insideProblem(from: Spot, to: Spot, frontend: Frontend): string {
  const apart = frontend.apart.includes(from.folder) && from.part !== to.part;
  return apart
    ? `One part of ${from.folder}/ does not import another: ` +
        `${from.part} imports ${to.part}.`
    : '';
}

/** What is wrong with an import between two files of the client. */
function problemOf(from: Spot, to: Spot, frontend: Frontend): string {
  if (from.folder === to.folder) {
    return insideProblem(from, to, frontend);
  }
  const allowed =
    from.folder === '' ? frontend.root : frontend.folders.get(from.folder);
  if (allowed === undefined) {
    return `${from.folder}/ is not a folder of the client.`;
  }
  return allowed.includes(to.folder)
    ? ''
    : `${nameOf(from)} may not import ${nameOf(to).toLowerCase()}.`;
}

function importFindings(file: SourceFile, frontend: Frontend): Finding[] {
  const from = spotOf(file.path, frontend);
  return file.imports.flatMap((record) => {
    const to = spotOf(record.target ?? '', frontend);
    const detail =
      from === undefined || to === undefined
        ? ''
        : problemOf(from, to, frontend);
    return detail === ''
      ? []
      : [{ rule: ID, path: file.path, line: record.line, detail }];
  });
}

function targetsOf(file: SourceFile | undefined): string[] {
  return (file?.imports ?? []).flatMap((record: ImportRecord) =>
    record.target === undefined ? [] : [record.target],
  );
}

function folderOf(path: string, frontend: Frontend): string {
  return spotOf(path, frontend)?.folder ?? '';
}

/** The chain that leads a file where its folder must never get, or none. */
function chainOf(file: SourceFile, files: Files, frontend: Frontend): string[] {
  const never = frontend.noChain.get(folderOf(file.path, frontend)) ?? [];
  const chain = chainFrom(
    file.path,
    (path) => targetsOf(files.get(path)),
    (path) => never.includes(folderOf(path, frontend)),
  );
  return chain !== undefined && chain.length >= SHORTEST_CHAIN ? chain : [];
}

/**
 * The table alone makes such a chain impossible. This keeps it so when
 * the table changes. The finding is on the import that starts the chain.
 */
function chainFindings(
  file: SourceFile,
  files: Files,
  frontend: Frontend,
): Finding[] {
  const chain = chainOf(file, files, frontend);
  const from = folderOf(file.path, frontend);
  const end = folderOf(chain.at(-1) ?? '', frontend);
  return file.imports
    .filter((record) => chain.length > 0 && record.target === chain[1])
    .slice(0, 1)
    .map((record) => ({
      rule: ID,
      path: file.path,
      line: record.line,
      detail:
        `${from}/ reaches ${end}/ through a chain of imports: ` +
        `${chain.join(' → ')}.`,
    }));
}

function check(project: Project, frontend: Frontend): Finding[] {
  const byPath = new Map(project.files.map((file) => [file.path, file]));
  return project.files.flatMap((file) => [
    ...importFindings(file, frontend),
    ...chainFindings(file, byPath, frontend),
  ]);
}

/**
 * A folder of the client imports only the folders the policy lists for
 * it. What the table does not list is refused, whether or not it makes a
 * cycle. An `import type` counts: it is a dependency of the design.
 */
export function clientDirection(frontend: Frontend): Rule {
  return { id: ID, check: (project) => check(project, frontend) };
}
