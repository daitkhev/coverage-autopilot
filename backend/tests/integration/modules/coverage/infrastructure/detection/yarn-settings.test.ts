import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { cleanSettingsIn } from '#coverage/infrastructure/detection/yarn-settings';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';

const CLEAN = '.coverage-autopilot-yarnrc.yml';

const LINKER = 'nodeLinker: node-modules\n';

const folders: ProjectFolder[] = [];

function folderWith(files: Readonly<Record<string, string>>): ProjectFolder {
  const folder = createProjectFolder(files);
  folders.push(folder);
  return folder;
}

function cleaned(settings: string): string {
  const folder = folderWith({ '.yarnrc.yml': settings });
  expect(cleanSettingsIn(folder.root)).toBeNull();
  return readFileSync(join(folder.root, CLEAN), 'utf8');
}

function refusalOf(settings: string): ReturnType<typeof cleanSettingsIn> {
  return cleanSettingsIn(folderWith({ '.yarnrc.yml': settings }).root);
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

describe('cleanSettingsIn', () => {
  describe('when the settings install into node_modules', () => {
    it('should write them without the settings that load code of the repository', () => {
      const settings =
        '# Settings of acme/gadgets.\n' +
        `${LINKER}yarnPath: .yarn/releases/yarn-4.13.0.cjs\n\n` +
        'plugins:\n  - path: .yarn/plugins/gadgets.cjs\n    spec: gadgets\n' +
        '"enableConstraintsChecks": true\n' +
        'npmScopes:\n  acme:\n    npmRegistryServer: "https://registry.example.com"\n' +
        "packageExtensions:\n  'gadgets@*':\n    dependencies:\n      widgets: '*'\n";

      expect(cleaned(settings)).toBe(
        `# Settings of acme/gadgets.\n${LINKER}` +
          'npmScopes:\n  acme:\n    npmRegistryServer: "https://registry.example.com"\n' +
          "packageExtensions:\n  'gadgets@*':\n    dependencies:\n      widgets: '*'\n",
      );
    });

    it('should end them with a line break when the last setting is dropped', () => {
      expect(cleaned(`${LINKER}yarnPath: ./yarn.cjs\n`)).toBe(LINKER);
    });

    it('should not follow what code of the repository left at the place of its file', () => {
      const outside = folderWith({ 'kept.yml': 'untouched\n' });
      const folder = folderWith({ '.yarnrc.yml': LINKER });
      symlinkSync(join(outside.root, 'kept.yml'), join(folder.root, CLEAN));

      expect(cleanSettingsIn(folder.root)).toBeNull();
      expect(readFileSync(join(outside.root, 'kept.yml'), 'utf8')).toBe(
        'untouched\n',
      );
      expect(readFileSync(join(folder.root, CLEAN), 'utf8')).toBe(LINKER);
    });
  });

  describe('when yarn would keep the packages out of node_modules', () => {
    it.each([
      [
        'no file',
        null,
        "sets no nodeLinker, so yarn installs with Plug'n'Play",
      ],
      ['no linker', 'enableTelemetry: false\n', 'sets no nodeLinker'],
      ['pnp', 'nodeLinker: "pnp"\n', 'sets nodeLinker to pnp'],
    ])('should refuse %s as Plug and Play', (_case, settings, detail) => {
      const folder = folderWith(
        settings === null ? {} : { '.yarnrc.yml': settings },
      );

      const refusal = cleanSettingsIn(folder.root);

      expect(refusal).toMatchObject({ reason: 'plug_and_play' });
      expect(refusal?.detail).toContain(detail);
    });

    it('should refuse the linker of pnpm, naming it', () => {
      expect(refusalOf('nodeLinker: pnpm\n')).toEqual({
        outcome: 'unsupported',
        reason: 'unsupported_package_manager',
        detail:
          '.yarnrc.yml sets nodeLinker to pnpm, and only nodeLinker: ' +
          'node-modules is supported.',
      });
    });
  });

  describe('when the service does not read the settings', () => {
    it.each([
      ['a mapping indented as a whole', `  ${LINKER}  plugins: []\n`, 1],
      ['a flow mapping', `${LINKER}{plugins: []}\n`, 2],
      ['a merge', `${LINKER}<<: *base\n`, 2],
      ['a tab', `${LINKER}npmScopes:\n\tacme: {}\n`, 3],
      ['an escaped name', `${LINKER}"plu\\x67ins": []\n`, 2],
    ])('should refuse %s, naming its line', (_case, settings, line) => {
      expect(refusalOf(settings)).toEqual({
        outcome: 'unsupported',
        reason: 'install_runs_code',
        detail:
          `The service does not read line ${String(line)} of .yarnrc.yml, ` +
          'so it cannot tell that no setting there loads code of the ' +
          'repository.',
      });
    });

    it('should refuse a file that is not plain', () => {
      const outside = folderWith({ 'settings.yml': LINKER });
      const folder = folderWith({});
      symlinkSync(
        join(outside.root, 'settings.yml'),
        join(folder.root, '.yarnrc.yml'),
      );

      expect(cleanSettingsIn(folder.root)).toMatchObject({
        reason: 'install_runs_code',
        detail: expect.stringContaining(
          '.yarnrc.yml, which is not a plain file',
        ) as unknown,
      });
    });
  });
});
