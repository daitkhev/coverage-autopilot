import { describe, expect, it } from 'vitest';

import {
  gitVersionOf,
  isOlder,
  OLDEST_GIT,
  versionText,
} from '#repositories/application/commands/check-access/git-version';

describe('gitVersionOf', () => {
  it.each([
    ['git version 2.50.1 (Apple Git-155)', { major: 2, minor: 50 }],
    ['git version 2.45.1.windows.1', { major: 2, minor: 45 }],
    ['git version 2.36.0\n', { major: 2, minor: 36 }],
    ['git version 10.2', { major: 10, minor: 2 }],
  ])('should read %j', (answer, version) => {
    expect(gitVersionOf(answer)).toEqual(version);
  });

  describe('when the answer names no version', () => {
    it.each(['', 'git version', 'git version two', 'hub version 2.50.1'])(
      'should give null for %j',
      (answer) => {
        expect(gitVersionOf(answer)).toBeNull();
      },
    );
  });
});

describe('isOlder', () => {
  it.each([
    [{ major: 2, minor: 35 }, true],
    [{ major: 1, minor: 99 }, true],
    [{ major: 2, minor: 36 }, false],
    [{ major: 2, minor: 50 }, false],
    [{ major: 3, minor: 0 }, false],
  ])('should tell whether %j came out before 2.36: %s', (version, older) => {
    expect(isOlder(version, OLDEST_GIT)).toBe(older);
  });

  it('should compare the minor numbers by value, not as text', () => {
    expect(isOlder({ major: 2, minor: 9 }, { major: 2, minor: 10 })).toBe(true);
  });
});

describe('versionText', () => {
  it('should write the oldest git the service runs as people do', () => {
    expect(versionText(OLDEST_GIT)).toBe('2.36');
  });
});
