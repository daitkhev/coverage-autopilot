import type { PackageRule } from '#harness/shared/packages';
import type { Backend, Structure } from '#harness/shared/structure';

/** Where the modules of the service used in the tests are. */
export const MODULES = 'backend/src/modules';
export const SHARED = 'backend/src/shared';

/**
 * A small service for the tests: `store` is used by `reports`, which is used
 * by `runs`. The layers and the shared folders follow the real policy.
 */
export function backendOf(): Backend {
  return {
    source: 'backend/src/',
    migrations: 'backend/migrations/',
    modules: new Map([
      ['store', []],
      ['reports', ['store']],
      ['runs', ['reports', 'store']],
    ]),
    layers: new Map([
      ['domain', { layers: ['domain'], shared: ['kernel'] }],
      [
        'application',
        {
          layers: ['application', 'contracts', 'domain'],
          shared: ['application', 'kernel'],
        },
      ],
      [
        'infrastructure',
        {
          layers: ['application', 'domain', 'infrastructure'],
          shared: ['application', 'infrastructure', 'kernel'],
        },
      ],
      ['contracts', { layers: ['contracts'], shared: ['kernel'] }],
    ]),
    reachOtherModules: ['application', 'contracts'],
    shared: new Map([
      ['kernel', []],
      ['application', ['kernel']],
      ['infrastructure', ['application', 'kernel']],
    ]),
    suffixes: new Map([
      ['.entity.ts', ['domain/entities/']],
      ['.error.ts', ['domain/errors/', 'application/errors/']],
    ]),
  };
}

export function structureOf(): Structure {
  return {
    extensions: ['.ts', '.tsx'],
    excluded: [],
    bannedNames: [],
    workspaces: new Map([
      ['backend', new Map([['#store/*', './src/modules/store/*.ts']])],
      ['frontend', new Map([['#app/*', './src/app/*.tsx']])],
    ]),
    manifestFields: ['name', 'version', 'imports', 'dependencies'],
    workspaceFiles: new Map([
      [
        'backend',
        new Map([
          ['', ['package.json', 'tsconfig.json']],
          ['src/', ['.ts']],
          ['tests/', ['.ts']],
          ['migrations/', ['.sql']],
        ]),
      ],
      [
        'frontend',
        new Map([
          ['', ['package.json', 'tsconfig.json']],
          ['src/', ['.ts', '.tsx']],
        ]),
      ],
    ]),
    links: new Map([['.agent/settings.json', '../harness/settings.json']]),
    packageAliases: new Map([['pad-cjs', 'left-pad']]),
    backend: backendOf(),
  };
}

interface RuleShape {
  readonly packages: readonly string[];
  readonly places: readonly string[];
  readonly names?: readonly string[];
}

export function packageRule(shape: RuleShape): PackageRule {
  return {
    packages: shape.packages,
    places: shape.places,
    names: shape.names,
  };
}
