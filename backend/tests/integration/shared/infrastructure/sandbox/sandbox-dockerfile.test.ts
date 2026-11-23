import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { VARIABLES } from '#infrastructure/config/service-environment.schema';
import { SHIPPED_IMAGE_FILES } from '#tests/support/shipped-image';

/** The image a file starts from, as its first `FROM` names it. */
const BASE = /^FROM (?<image>\S+)$/mu;

/** What follows `apt-get install` up to the end of the command. */
const APT_INSTALL = /apt-get install(?<words>[^\n&\\]*)/u;

/** What follows `npm install --global` up to the end of the command. */
const GLOBAL_INSTALL = /npm install --global(?<words>[^\n&\\]*)/u;

/** A package at an exact version, as an install names it. */
const EXACT = /^(?<name>[a-z]+)@\d+\.\d+\.\d+$/u;

/** The Node the project uses, in the slim variant of its image. */
const NODE_BASE = /^node:(?<major>\d+)-slim$/u;

function baseOf(file: string): string | undefined {
  return BASE.exec(readFileSync(file, 'utf8'))?.groups?.['image'];
}

/** The packages a command installs, without the options of the install. */
function packagesOf(file: string, command: RegExp = APT_INSTALL): string[] {
  const words = command.exec(readFileSync(file, 'utf8'))?.groups?.['words'];
  return (words ?? '')
    .split(/\s+/u)
    .filter((word) => word !== '' && !word.startsWith('-'));
}

describe('sandbox.Dockerfile', () => {
  it('should start from the same slim image of Node as the file of the generator', () => {
    const base = baseOf(SHIPPED_IMAGE_FILES.sandbox);

    expect(base).toBe('node:26-slim');
    expect(base).toBe(baseOf(SHIPPED_IMAGE_FILES.generator));
  });

  it('should install procps, whose ps the mutation tool ends its test runners with', () => {
    expect(packagesOf(SHIPPED_IMAGE_FILES.sandbox)).toContain('procps');
  });

  it('should install git with the certificates of https and no ssh client, for a trusted package from a git repository', () => {
    expect(packagesOf(SHIPPED_IMAGE_FILES.sandbox)).toEqual([
      'procps',
      'git',
      'ca-certificates',
    ]);
  });

  it('should install Corepack alone, at an exact version, to fetch pnpm and yarn', () => {
    const packages = packagesOf(SHIPPED_IMAGE_FILES.sandbox, GLOBAL_INSTALL);

    expect(packages.map((word) => EXACT.exec(word)?.groups?.['name'])).toEqual([
      'corepack',
    ]);
  });

  it('should name the version of Node of its base as the tag of the default image of the commands', () => {
    const base = baseOf(SHIPPED_IMAGE_FILES.sandbox) ?? '';
    const major = NODE_BASE.exec(base)?.groups?.['major'];
    const tag = VARIABLES.AUTOPILOT_SANDBOX_IMAGE.fallback.split(':').at(-1);

    expect(major).toBeDefined();
    expect(tag).toBe(major);
  });
});
