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
  /** Each module, with the modules it may use. */
  readonly modules: ReadonlyMap<string, readonly string[]>;
  readonly layers: ReadonlyMap<string, LayerRule>;
  /** Layers that may import the contracts of another module. */
  readonly reachOtherModules: readonly string[];
  /** Each folder of the shared code, with the folders it may import. */
  readonly shared: ReadonlyMap<string, readonly string[]>;
  /** Each role suffix, with the folders of a module it may be in. */
  readonly suffixes: ReadonlyMap<string, readonly string[]>;
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
    modules: stringListsAt(backend, 'modules'),
    layers: layersOf(backend),
    reachOtherModules: stringListAt(backend, 'reachOtherModules'),
    shared: stringListsAt(backend, 'shared'),
    suffixes: stringListsAt(backend, 'suffixes'),
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
    backend: backendOf(file),
  };
}
