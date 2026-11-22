import { describe, expect, it } from 'vitest';

import { readMutationRuns } from '#harness/shared/mutation-policy';
import { readPackageRules } from '#harness/shared/packages';
import { readLimits } from '#harness/shared/policy';
import { readStructure } from '#harness/shared/structure';

/** Packages that stand between the code and its SQL. The design has none. */
const DATABASE_LAYERS = [
  '@mikro-orm/core',
  '@prisma/client',
  'better-sqlite3',
  'drizzle-orm',
  'knex',
  'kysely',
  'objection',
  'prisma',
  'sequelize',
  'sqlite3',
  'typeorm',
];

describe('readStructure', () => {
  it('should read what is measured and which names are refused', () => {
    expect(readStructure().extensions).toContain('.ts');
    expect(readStructure().excluded).toContain('harness/fixtures/');
    expect(readStructure().bannedNames).toEqual(
      expect.arrayContaining(['index', 'utils', 'helpers', 'common', 'misc']),
    );
  });

  it('should have the four modules, each using only the ones before it', () => {
    const names = [...readStructure().backend.modules.keys()];

    expect(names).toEqual([
      'repositories',
      'coverage',
      'verification',
      'improvement',
    ]);
    for (const [index, name] of names.entries()) {
      const before = names.slice(0, index);

      expect(before).toEqual(
        expect.arrayContaining([
          ...(readStructure().backend.modules.get(name) ?? []),
        ]),
      );
    }
  });

  it('should let no folder of the client import its composition', () => {
    const importers = [...readStructure().frontend.folders.entries()]
      .filter(([, uses]) => uses.includes('composition'))
      .map(([name]) => name);

    expect(importers).toEqual([]);
  });

  it('should put the composition of the service in a folder of its own', () => {
    expect(readStructure().backend.composition).toBe('composition/');
  });

  it('should give the client the folders of the design, each importing one way', () => {
    const { folders, root, apart, noChain } = readStructure().frontend;

    expect(Object.fromEntries(folders)).toEqual({
      composition: ['app', 'commands'],
      app: ['screens', 'components', 'hooks', 'theme', 'api'],
      screens: ['components', 'hooks', 'theme', 'api'],
      commands: ['api', 'theme'],
      components: ['hooks', 'theme'],
      hooks: ['theme'],
      api: [],
      theme: [],
    });
    expect(root).toEqual(['app', 'commands', 'composition']);
    expect(apart).toEqual(['screens']);
    expect(Object.fromEntries(noChain)).toEqual({
      components: ['api'],
      hooks: ['api'],
    });
  });

  it('should let no folder of the client import one that imports it', () => {
    const { folders } = readStructure().frontend;

    for (const [folder, allowed] of folders) {
      for (const other of allowed) {
        expect(folders.get(other)).toBeDefined();
        expect(folders.get(other)).not.toContain(folder);
      }
    }
  });

  it('should know the kinds of tests, and which of them repeats a path', () => {
    const tests = readStructure().tests;

    expect(tests.kinds).toEqual(['unit', 'integration', 'e2e', 'stress']);
    expect(tests.mirrored).toBe('unit');
    expect(tests.support).toBe('support');
    expect(tests.suffixes).toEqual(['.test.ts', '.test.tsx']);
  });

  it('should take for I/O the layer and the modules a unit test may not reach', () => {
    const tests = readStructure().tests;

    expect(tests.ioLayers).toEqual(['infrastructure', 'infrastructure/http']);
    expect(tests.ioModules).toEqual(
      expect.arrayContaining([
        'child_process',
        'fs',
        'http',
        'net',
        'sqlite',
        'worker_threads',
      ]),
    );
    expect(tests.ioModules).not.toContain('path');
  });

  it('should keep the domain free of every other layer', () => {
    expect(readStructure().backend.layers.get('domain')).toEqual({
      layers: ['domain'],
      shared: ['kernel'],
    });
  });

  it('should name only known layers and known shared folders', () => {
    const layers = [...readStructure().backend.layers.keys()];
    const shared = [...readStructure().backend.shared.keys()];

    for (const rule of readStructure().backend.layers.values()) {
      expect(layers).toEqual(expect.arrayContaining([...rule.layers]));
      expect(shared).toEqual(expect.arrayContaining([...rule.shared]));
    }
    for (const uses of readStructure().backend.shared.values()) {
      expect(shared).toEqual(expect.arrayContaining([...uses]));
    }
    expect(layers).toEqual(
      expect.arrayContaining([...readStructure().backend.reachOtherModules]),
    );
  });

  it('should let no layer import the routes of a module but themselves', () => {
    const importers = [...readStructure().backend.layers.entries()]
      .filter(([, rule]) => rule.layers.includes('infrastructure/http'))
      .map(([name]) => name);

    expect(importers).toEqual(['infrastructure/http']);
  });

  it('should let the contracts of a module import nothing else of it', () => {
    const { layers, contracts } = readStructure().backend;

    for (const name of contracts) {
      expect(layers.get(name)?.layers).toEqual([name]);
    }
  });

  it('should put every role suffix in a folder of a known layer', () => {
    const layers = [...readStructure().backend.layers.keys()];

    for (const folders of readStructure().backend.suffixes.values()) {
      for (const folder of folders) {
        expect(layers).toContain(folder.split('/')[0]);
        expect(folder.endsWith('/')).toBe(true);
      }
    }
  });

  it('should keep every alias of a workspace inside that workspace', () => {
    for (const aliases of readStructure().workspaces.values()) {
      for (const [alias, target] of aliases) {
        expect(alias).toMatch(/^#[a-z-]+\/\*$/);
        expect(target).toMatch(/^\.\/(src|tests)\//);
        expect(target).not.toContain('..');
      }
    }
  });

  it('should let a workspace have no scripts', () => {
    expect(readStructure().manifestFields).not.toContain('scripts');
  });
});

describe('readPackageRules', () => {
  it('should give every rule packages and places', () => {
    for (const rule of readPackageRules()) {
      expect(rule.packages).not.toHaveLength(0);
      expect(rule.places).not.toHaveLength(0);
    }
  });

  it('should list no package that stands between the code and its SQL', () => {
    const listed = readPackageRules().flatMap((rule) => rule.packages);

    expect(listed.filter((name) => DATABASE_LAYERS.includes(name))).toEqual([]);
  });

  it('should allow the database only where the SQL is written', () => {
    const places = readPackageRules()
      .filter((rule) => rule.packages.includes('node:sqlite'))
      .flatMap((rule) => rule.places);

    expect(places).toEqual([
      'backend/src/modules/*/infrastructure/persistence/',
      'backend/src/shared/infrastructure/database/',
    ]);
  });

  it('should allow no package in the domain of a module', () => {
    const places = readPackageRules().flatMap((rule) => rule.places);

    expect(places.filter((place) => place.includes('/domain'))).toEqual([]);
  });

  it('should allow every module of Node only in the harness and in tests', () => {
    const places = readPackageRules()
      .filter((rule) => rule.packages.includes('node:*'))
      .flatMap((rule) => rule.places);

    expect(places.every((place) => /^harness\/$|\/tests\/$/.test(place))).toBe(
      true,
    );
  });

  it('should start every place in the harness or in a workspace', () => {
    const roots = ['harness', ...readStructure().workspaces.keys()];

    for (const place of readPackageRules().flatMap((rule) => rule.places)) {
      expect(roots).toContain(place.split('/')[0]);
    }
  });
});

describe('readLimits', () => {
  it('should read the limits the design agreed on', () => {
    expect(readLimits()).toEqual({
      functionLines: 50,
      functionBranches: 8,
      functionDepth: 3,
      functionParameters: 3,
      fileLines: 300,
      duplicationPercent: 0.9,
      coverage: { statements: 95, branches: 95, functions: 95, lines: 95 },
      mutationFloors: new Map([['harness', 88]]),
    });
  });
});

describe('readMutationRuns', () => {
  it('should hold every source file of the harness in one area', () => {
    expect(readMutationRuns()).toEqual([
      {
        name: 'harness',
        config: 'harness/configs/stryker.json',
        report: 'reports/mutation/harness.json',
        areas: [
          {
            name: 'harness',
            places: ['harness/'],
            excluded: [
              'harness/bin/',
              'harness/agents/hooks/',
              'harness/tests/',
            ],
          },
        ],
      },
    ]);
  });

  it('should have a floor only for an area that exists', () => {
    const areas = readMutationRuns().flatMap((run) =>
      run.areas.map((area) => area.name),
    );

    expect(areas).toEqual(
      expect.arrayContaining([...readLimits().mutationFloors.keys()]),
    );
  });
});
