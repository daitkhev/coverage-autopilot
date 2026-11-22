import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { VARIABLES } from '#infrastructure/config/service-environment.schema';
import { SHIPPED_IMAGE_FILE } from '#tests/support/shipped-image';

/** The version after the last `@` of the package the file installs. */
const INSTALLED_VERSION = /npm install --global \S+@(?<version>[^\s@]+)/u;

const RELEASE = /^\d+\.\d+\.\d+$/u;

describe('generator.Dockerfile', () => {
  it('should install the CLI at the version the default image of the generator names as its tag', () => {
    const file = readFileSync(SHIPPED_IMAGE_FILE, 'utf8');
    const installed = INSTALLED_VERSION.exec(file)?.groups?.['version'];
    const tag = VARIABLES.AUTOPILOT_GENERATOR_IMAGE.fallback.split(':').at(-1);

    expect(installed).toMatch(RELEASE);
    expect(tag).toBe(installed);
  });
});
