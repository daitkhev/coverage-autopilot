import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RepositoriesSettings } from '#repositories/infrastructure/repositories-settings';

/** The hooks a planted folder of hooks offers, each running the script. */
const HOOKS = [
  'post-checkout',
  'post-commit',
  'post-index-change',
  'pre-commit',
  'pre-push',
  'reference-transaction',
];

/** The script must be a program git can start. */
const EXECUTABLE = 0o755;

/** Where the git of the host takes its configuration from, apart from a repository. */
type ConfigurationPlace = 'global' | 'system' | 'variables';

/** Each place outside a repository, as a test names it. */
export const CONFIGURATION_PLACES: readonly {
  readonly place: ConfigurationPlace;
  readonly name: string;
}[] = [
  { place: 'global', name: 'the global configuration' },
  { place: 'system', name: 'the system configuration' },
  { place: 'variables', name: 'configuration in variables of the environment' },
];

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content);
  chmodSync(path, EXECUTABLE);
}

/**
 * What untrusted code would plant to make the git of the host start a
 * program of its choice: a script that leaves a marker file, and the
 * configuration, hooks and attributes that name it. A test asks whether
 * the marker is there.
 */
export class GitPlanter {
  private readonly folder: string;
  private readonly marker: string;
  private readonly script: string;
  private readonly hooks: string;

  public constructor(folder: string) {
    this.folder = folder;
    this.marker = join(folder, 'planted-command-ran');
    this.script = join(folder, 'planted.sh');
    this.hooks = join(folder, 'planted-hooks');
    writeExecutable(this.script, `#!/bin/sh\n: > '${this.marker}'\nexec cat\n`);
    this.hooksAt(this.hooks);
  }

  /** Whether git started the planted script at least once. */
  public ran(): boolean {
    return existsSync(this.marker);
  }

  /** A configuration that names the script as a file system monitor. */
  public monitorConfig(): string {
    return `[core]\n\tfsmonitor = ${this.script}\n`;
  }

  /** A configuration that defines the drivers `x` with the script. */
  public driverConfig(): string {
    return [
      '[filter "x"]',
      `\tclean = ${this.script}`,
      `\tsmudge = ${this.script}`,
      '[diff "x"]',
      `\ttextconv = ${this.script}`,
      `\tcommand = ${this.script}`,
      '',
    ].join('\n');
  }

  /** The attributes that select the drivers `x` for every file. */
  public attributes(): string {
    return '* filter=x diff=x\n';
  }

  /**
   * A git directory at the path, as git takes one, with hooks and every
   * planted configuration of its own.
   */
  public gitDirectoryAt(path: string): void {
    mkdirSync(join(path, 'objects'), { recursive: true });
    mkdirSync(join(path, 'refs/heads'), { recursive: true });
    this.hooksAt(join(path, 'hooks'));
    writeFileSync(join(path, 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(
      join(path, 'config'),
      `[core]\n\trepositoryformatversion = 0\n\tbare = false\n${this.fullConfig()}`,
    );
  }

  /** The settings with every planted configuration in one place git reads. */
  public configuredIn(
    place: ConfigurationPlace,
    settings: RepositoriesSettings,
  ): RepositoriesSettings {
    const environment = settings.git.environment;
    const planted: Record<ConfigurationPlace, () => Record<string, string>> = {
      global: () => ({ ...environment, GIT_CONFIG_GLOBAL: this.configFile() }),
      system: () => ({
        ...environment,
        GIT_CONFIG_NOSYSTEM: '0',
        GIT_CONFIG_SYSTEM: this.configFile(),
      }),
      variables: () => this.variablesIn(environment),
    };
    return {
      ...settings,
      git: { ...settings.git, environment: planted[place]() },
    };
  }

  /** Every way at once: the monitor, the hooks and the drivers. */
  private fullConfig(): string {
    return [
      this.monitorConfig(),
      `[core]\n\thooksPath = ${this.hooks}\n`,
      this.driverConfig(),
    ].join('');
  }

  private configFile(): string {
    const path = join(this.folder, 'planted-gitconfig');
    writeFileSync(path, this.fullConfig());
    return path;
  }

  /** The configuration in variables, after those the environment has. */
  private variablesIn(
    environment: Readonly<Record<string, string>>,
  ): Record<string, string> {
    const first = Number(environment['GIT_CONFIG_COUNT'] ?? '0');
    const entries: readonly (readonly [string, string])[] = [
      ['core.fsmonitor', this.script],
      ['core.hooksPath', this.hooks],
      ['filter.x.clean', this.script],
      ['filter.x.smudge', this.script],
      ['diff.x.textconv', this.script],
      ['diff.x.command', this.script],
    ];
    const variables = entries.flatMap(
      ([key, value], index): [string, string][] => [
        [`GIT_CONFIG_KEY_${String(first + index)}`, key],
        [`GIT_CONFIG_VALUE_${String(first + index)}`, value],
      ],
    );
    return {
      ...environment,
      ...Object.fromEntries(variables),
      GIT_CONFIG_COUNT: String(first + entries.length),
    };
  }

  private hooksAt(folder: string): void {
    mkdirSync(folder, { recursive: true });
    for (const hook of HOOKS) {
      writeExecutable(join(folder, hook), `#!/bin/sh\nexec '${this.script}'\n`);
    }
  }
}
