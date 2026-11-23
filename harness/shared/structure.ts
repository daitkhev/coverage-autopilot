import {
  type JsonRecord,
  readJsonRecord,
  recordAt,
  stringAt,
  stringListAt,
  stringListsAt,
  stringsAt,
} from '#harness/shared/json';
import { policyFile } from '#harness/shared/policy';

/** What one layer of a module may import. */
interface LayerRule {
  /** Layers of the same module. */
  readonly layers: readonly string[];
  /** Folders of the shared code. */
  readonly shared: readonly string[];
}

/** The shape of the service: its modules, their layers, the shared code. */
export interface Backend {
  /** Where the source of the service is, with a slash at the end. */
  readonly source: string;
  /** Where the migrations are, with a slash at the end. */
  readonly migrations: string;
  /** The one file at the root of the source, which starts the service. */
  readonly entry: string;
  /**
   * The folder under the source where the service is put together from
   * its modules, with a slash at the end.
   */
  readonly composition: string;
  /** Each module, with the modules it may use. */
  readonly modules: ReadonlyMap<string, readonly string[]>;
  readonly layers: ReadonlyMap<string, LayerRule>;
  /** The layers another module may import: the contracts of a module. */
  readonly contracts: readonly string[];
  /** Layers that may import the contracts of another module. */
  readonly reachOtherModules: readonly string[];
  /** Each folder of the shared code, with the folders it may import. */
  readonly shared: ReadonlyMap<string, readonly string[]>;
  /** Each role suffix, with the folders of a module it may be in. */
  readonly suffixes: ReadonlyMap<string, readonly string[]>;
}

/**
 * The shape of the client: its folders, and what each may import. The
 * client has no layers of a domain, and its folders still import one way.
 */
export interface Frontend {
  /** Where the source of the client is, with a slash at the end. */
  readonly source: string;
  /** The one file at the root of the source, which starts the client. */
  readonly entry: string;
  /** The folders a file at the root of the source may import. */
  readonly root: readonly string[];
  /** Each folder, with the other folders it may import. */
  readonly folders: ReadonlyMap<string, readonly string[]>;
  /** Folders whose parts stand apart: one part never imports another. */
  readonly apart: readonly string[];
  /** Each folder, with the folders no chain of imports may lead it to. */
  readonly noChain: ReadonlyMap<string, readonly string[]>;
}

/** Where the tests of a workspace are, and what a unit test may reach. */
export interface TestRules {
  /** The ends of the name of a file that holds tests. */
  readonly suffixes: readonly string[];
  /** The kinds of tests. Each has a folder under `tests/`. */
  readonly kinds: readonly string[];
  /** The kind whose tests repeat the path of their source file. */
  readonly mirrored: string;
  /** The folder under `tests/` for what tests share. It holds no test. */
  readonly support: string;
  /** The layers of the service that do I/O. */
  readonly ioLayers: readonly string[];
  /** The modules built into Node that do I/O, without `node:`. */
  readonly ioModules: readonly string[];
}

export interface Structure {
  /** Extensions of the files the ratchet reads as source. */
  readonly extensions: readonly string[];
  /** Path prefixes that are not measured. */
  readonly excluded: readonly string[];
  /** Names a file or a folder may not have. */
  readonly bannedNames: readonly string[];
  /** Each workspace, with the aliases its `package.json` must declare. */
  readonly workspaces: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** The fields a `package.json` of a workspace may have. */
  readonly manifestFields: readonly string[];
  /**
   * What each workspace may hold. Under the empty name are the files of
   * its root. Under each folder are the extensions a file there may have.
   * The longest folder a file is in judges it, and its list stands alone:
   * it does not add to the list of a folder around it.
   */
  readonly workspaceFiles: ReadonlyMap<
    string,
    ReadonlyMap<string, readonly string[]>
  >;
  /** Every symbolic link of the tree, with the target it must have. */
  readonly links: ReadonlyMap<string, string>;
  /**
   * The names in the lockfile that stand for another package, each with
   * the package it stands for. A package of the registry asks for them.
   */
  readonly packageAliases: ReadonlyMap<string, string>;
  readonly tests: TestRules;
  readonly frontend: Frontend;
  readonly backend: Backend;
}

function layersOf(backend: JsonRecord): Map<string, LayerRule> {
  const layers = recordAt(backend, 'layers');
  return new Map(
    Object.keys(layers).map((name) => {
      const rule = recordAt(layers, name);
      return [
        name,
        {
          layers: stringListAt(rule, 'layers'),
          shared: stringListAt(rule, 'shared'),
        },
      ];
    }),
  );
}

function backendOf(file: JsonRecord): Backend {
  const backend = recordAt(file, 'backend');
  return {
    source: stringAt(backend, 'source'),
    migrations: stringAt(backend, 'migrations'),
    entry: stringAt(backend, 'entry'),
    composition: stringAt(backend, 'composition'),
    modules: stringListsAt(backend, 'modules'),
    layers: layersOf(backend),
    contracts: stringListAt(backend, 'contracts'),
    reachOtherModules: stringListAt(backend, 'reachOtherModules'),
    shared: stringListsAt(backend, 'shared'),
    suffixes: stringListsAt(backend, 'suffixes'),
  };
}

function frontendOf(file: JsonRecord): Frontend {
  const frontend = recordAt(file, 'frontend');
  return {
    source: stringAt(frontend, 'source'),
    entry: stringAt(frontend, 'entry'),
    root: stringListAt(frontend, 'root'),
    folders: stringListsAt(frontend, 'folders'),
    apart: stringListAt(frontend, 'apart'),
    noChain: stringListsAt(frontend, 'noChain'),
  };
}

function testsOf(file: JsonRecord): TestRules {
  const tests = recordAt(file, 'tests');
  return {
    suffixes: stringListAt(tests, 'suffixes'),
    kinds: stringListAt(tests, 'kinds'),
    mirrored: stringAt(tests, 'mirrored'),
    support: stringAt(tests, 'support'),
    ioLayers: stringListAt(tests, 'ioLayers'),
    ioModules: stringListAt(tests, 'ioModules'),
  };
}

function workspacesOf(file: JsonRecord): Map<string, Map<string, string>> {
  const workspaces = recordAt(file, 'workspaces');
  return new Map(
    Object.keys(workspaces).map((name) => [name, stringsAt(workspaces, name)]),
  );
}

function workspaceFilesOf(
  file: JsonRecord,
): Map<string, Map<string, string[]>> {
  const files = recordAt(file, 'files');
  return new Map(
    Object.keys(files).map((name) => [name, stringListsAt(files, name)]),
  );
}

export function readStructure(): Structure {
  const file = readJsonRecord(policyFile('structure.json'));
  const source = recordAt(file, 'source');
  return {
    extensions: stringListAt(source, 'extensions'),
    excluded: stringListAt(source, 'excluded'),
    bannedNames: stringListAt(recordAt(file, 'names'), 'banned'),
    workspaces: workspacesOf(file),
    manifestFields: stringListAt(recordAt(file, 'manifest'), 'fields'),
    workspaceFiles: workspaceFilesOf(file),
    links: stringsAt(file, 'links'),
    packageAliases: stringsAt(file, 'packageAliases'),
    tests: testsOf(file),
    frontend: frontendOf(file),
    backend: backendOf(file),
  };
}
