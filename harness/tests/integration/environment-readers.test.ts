import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { eslintConfig } from '#harness/eslint/config';
import { isRecord } from '#harness/shared/json';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

const BAN = 'no-restricted-properties';
const OFF = 0;
const ERROR = 2;

/**
 * The ban as ESLint works it out for one file. The file need not exist,
 * so the entry file of the service is held before it is written.
 */
async function banIn(filePath: string): Promise<unknown> {
  const eslint = new ESLint({
    cwd: REPOSITORY_ROOT,
    overrideConfigFile: true,
    overrideConfig: eslintConfig,
  });
  const config: unknown = await eslint.calculateConfigForFile(filePath);
  const rules = isRecord(config) && isRecord(config['rules']) ? config : {};
  return isRecord(rules['rules']) ? rules['rules'][BAN] : undefined;
}

describe('the files that read the environment', () => {
  it.each(['harness/gate/host.ts', 'backend/src/main.ts'])(
    'should let %s read it',
    async (filePath) => {
      expect(await banIn(filePath)).toEqual([OFF, expect.anything()]);
    },
  );

  it.each([
    'harness/gate/tools.ts',
    'backend/src/shared/infrastructure/config/service-config.ts',
    'backend/src/modules/coverage/infrastructure/main.ts',
    'frontend/src/main.tsx',
  ])('should refuse it in %s', async (filePath) => {
    expect(await banIn(filePath)).toEqual([
      ERROR,
      {
        object: 'process',
        property: 'env',
        message:
          'Only the entry file of the service reads the environment. Take a value.',
      },
    ]);
  });
});
