import { parseJson } from '#coverage/infrastructure/detection/copy-text';
import {
  INSTALL_CACHE,
  type ManagerChoice,
} from '#coverage/infrastructure/detection/manager-choice';
import { packageLockSchema } from '#coverage/infrastructure/detection/package-manifest.schema';

/** npm 7 and later write either of them, with every package it installs. */
export const NPM_LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json'];

/**
 * The npm of the image, whatever version package.json names. The lockfile
 * decides every version, and no script of a package runs while the
 * network is open: the code of the repository runs only later, in a
 * sandbox with no network.
 */
const INSTALL_COMMAND = [
  'npm',
  'ci',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--cache',
  INSTALL_CACHE,
];

export function npmChoice(lockfile: string): ManagerChoice {
  return {
    name: 'npm',
    lockfile,
    install: { command: INSTALL_COMMAND, environment: {} },
    lockedVersion: (text, declared) =>
      parseJson(text, packageLockSchema)?.packages?.[
        `node_modules/${declared.name}`
      ]?.version ?? null,
  };
}
