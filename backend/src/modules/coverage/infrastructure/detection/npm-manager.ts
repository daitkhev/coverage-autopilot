import type { InstallMode } from '#coverage/application/ports/project-detector.port';
import { parseJson } from '#coverage/infrastructure/detection/copy-text';
import {
  INSTALL_CACHE,
  type ManagerChoice,
} from '#coverage/infrastructure/detection/manager-choice';
import { packageLockSchema } from '#coverage/infrastructure/detection/package-manifest.schema';

/** npm 7 and later write either of them, with every package it installs. */
export const NPM_LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json'];

/**
 * Sandboxed, no script of a package runs while the network is open: the
 * code of the repository runs only later, in a sandbox with no network.
 */
const SCRIPT_SWITCHES: Readonly<Record<InstallMode, readonly string[]>> = {
  sandboxed: ['--ignore-scripts'],
  trusted: [],
};

/**
 * The npm of the image, whatever version package.json names. The lockfile
 * decides every version.
 */
function installCommand(mode: InstallMode): string[] {
  return [
    'npm',
    'ci',
    ...SCRIPT_SWITCHES[mode],
    '--no-audit',
    '--no-fund',
    '--cache',
    INSTALL_CACHE,
  ];
}

export function npmChoice(lockfile: string, mode: InstallMode): ManagerChoice {
  return {
    name: 'npm',
    lockfile,
    install: { command: installCommand(mode), environment: {} },
    lockedVersion: (text, declared) =>
      parseJson(text, packageLockSchema)?.packages?.[
        `node_modules/${declared.name}`
      ]?.version ?? null,
  };
}
