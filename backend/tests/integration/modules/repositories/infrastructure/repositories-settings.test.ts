import { describe, expect, it } from 'vitest';

import {
  type RepositoriesSettings,
  secretValuesOf,
} from '#repositories/infrastructure/repositories-settings';

function settingsWith(
  git: Record<string, string>,
  gh: Record<string, string>,
): RepositoriesSettings {
  return {
    threshold: { metric: 'lines', percentage: 80 },
    install: { mode: 'sandboxed' },
    workingCopiesRoot: '/srv/copies',
    git: { command: ['git'], environment: git, timeoutMs: 1 },
    gh: { command: ['gh'], environment: gh, timeoutMs: 1 },
    secretVariables: ['GH_TOKEN', 'GITHUB_TOKEN'],
  };
}

describe('secretValuesOf', () => {
  it('should give the values of the secret variables of both tools', () => {
    expect(
      secretValuesOf(
        settingsWith(
          { GH_TOKEN: 'first-secret', PATH: '/usr/bin' },
          { GITHUB_TOKEN: 'second-secret-value' },
        ),
      ),
    ).toEqual(['second-secret-value', 'first-secret']);
  });

  it('should give the longest first, so none is hidden in part', () => {
    expect(
      secretValuesOf(settingsWith({ GH_TOKEN: 'abc' }, { GH_TOKEN: 'abcdef' })),
    ).toEqual(['abcdef', 'abc']);
  });

  it('should leave out a variable that is not set or empty', () => {
    expect(secretValuesOf(settingsWith({ GH_TOKEN: '' }, {}))).toEqual([]);
  });
});
