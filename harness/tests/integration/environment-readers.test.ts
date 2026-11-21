import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { eslintConfig } from '#harness/eslint/config';
import { ENVIRONMENT_BAN } from '#harness/eslint/restricted-syntax';
import { isRecord } from '#harness/shared/json';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

const BANS = 'no-restricted-syntax';

/**
 * The banned shapes of code as ESLint works them out for one file. The
 * file need not exist, so an entry file is held before it is written.
 */
async function bansIn(filePath: string): Promise<unknown[]> {
  const eslint = new ESLint({
    cwd: REPOSITORY_ROOT,
    overrideConfigFile: true,
    overrideConfig: eslintConfig,
  });
  const config: unknown = await eslint.calculateConfigForFile(filePath);
  const rules = isRecord(config) ? config['rules'] : undefined;
  const rule = isRecord(rules) ? rules[BANS] : undefined;
  const options: unknown[] = Array.isArray(rule) ? rule : [];
  return options.slice(1);
}

describe('the files that read the environment', () => {
  it.each([
    'harness/gate/host.ts',
    'backend/src/main.ts',
    'frontend/src/main.tsx',
    'backend/tests/support/stand-in-engine.ts',
  ])('should let %s read it, and ban every other shape', async (filePath) => {
    const bans = await bansIn(filePath);

    expect(bans).not.toContainEqual(ENVIRONMENT_BAN);
    expect(bans.length).toBeGreaterThan(0);
  });

  it.each([
    'harness/gate/tools.ts',
    'backend/src/shared/infrastructure/config/service-config.ts',
    'backend/src/modules/coverage/infrastructure/main.ts',
    'backend/tests/support/fixed-clock.ts',
    'frontend/src/app/main.tsx',
    'frontend/src/api/client.ts',
  ])('should refuse it in %s', async (filePath) => {
    expect(await bansIn(filePath)).toContainEqual(ENVIRONMENT_BAN);
  });

  it('should leave a reader one ban short of every other file', async () => {
    const reader = await bansIn('backend/src/main.ts');
    const other = await bansIn('backend/src/main-of-another-name.ts');

    expect(other).toEqual([...reader, ENVIRONMENT_BAN]);
  });
});
