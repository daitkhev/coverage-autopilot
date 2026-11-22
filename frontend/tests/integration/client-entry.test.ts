import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SERVICE_ENTRY } from '#client/main';

const SOURCE_FOLDER = fileURLToPath(new URL('../../src/', import.meta.url));

describe('main', () => {
  it('should look for the entry file of the service beside its own', () => {
    expect(resolve(dirname(SERVICE_ENTRY))).toBe(resolve(SOURCE_FOLDER));
    expect(SERVICE_ENTRY.endsWith('service.js')).toBe(true);
  });
});
