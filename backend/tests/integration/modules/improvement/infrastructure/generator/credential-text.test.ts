import { describe, expect, it } from 'vitest';

import {
  holdsCredential,
  shortText,
  withoutCredential,
} from '#improvement/infrastructure/generator/credential-text';
import { CREDENTIAL_VALUE } from '#tests/support/generator-request';

describe('holdsCredential', () => {
  it('should find the exact value anywhere in a text', () => {
    expect(
      holdsCredential(`token=${CREDENTIAL_VALUE};`, CREDENTIAL_VALUE),
    ).toBe(true);
    expect(holdsCredential('token=not-a-real', CREDENTIAL_VALUE)).toBe(false);
  });

  it('should find an empty value in no text', () => {
    expect(holdsCredential('any text', '')).toBe(false);
  });
});

describe('withoutCredential', () => {
  it('should replace every occurrence', () => {
    expect(
      withoutCredential(
        `${CREDENTIAL_VALUE} and ${CREDENTIAL_VALUE}`,
        CREDENTIAL_VALUE,
      ),
    ).toBe('[credential] and [credential]');
  });

  it('should replace it also as JSON writes it inside a string', () => {
    const odd = 'a"b\\c';

    expect(withoutCredential(JSON.stringify({ token: odd }), odd)).toBe(
      '{"token":"[credential]"}',
    );
  });

  it('should leave a text as it is for an empty value', () => {
    expect(withoutCredential('a text', '')).toBe('a text');
  });
});

describe('shortText', () => {
  it('should hide the credential before it cuts the text', () => {
    expect(shortText(`ab ${CREDENTIAL_VALUE}`, CREDENTIAL_VALUE, 8)).toBe(
      'ab [cred',
    );
  });
});
