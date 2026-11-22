import { describe, expect, it } from 'vitest';

import { staysImport } from '#harness/gate/run-build';

describe('staysImport', () => {
  it.each([
    ['a package of npm', '@nestjs/common'],
    ['a file of a package', '@nestjs/common/interfaces/thing.js'],
    ['a package with no scope', 'zod'],
    ['a module of Node', 'node:sqlite'],
  ])('should leave %s an import', (_name, id) => {
    expect(staysImport(id)).toBe(true);
  });

  it.each([
    ['an alias of a workspace', '#service/app.module'],
    ['a file beside the importer', './greeting.ts'],
    ['a file by its whole path', '/tree/backend/src/main.ts'],
    ['the contracts', '@coverage-autopilot/api-contracts/health'],
    ['a helper of the bundler', '@oxc-project/runtime/helpers/decorate'],
  ])('should put %s into the file', (_name, id) => {
    expect(staysImport(id)).toBe(false);
  });
});
