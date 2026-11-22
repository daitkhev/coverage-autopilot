import { describe, expect, it } from 'vitest';

import {
  apiErrorAnswerTo,
  faultFieldsOf,
} from '#infrastructure/http/api-error-answer';

describe('apiErrorAnswerTo', () => {
  it('should answer a thing that is no error as a fault', () => {
    expect(apiErrorAnswerTo('text').status).toBe(500);
  });
});

describe('faultFieldsOf', () => {
  it('should keep the name and the words of an error with no code', () => {
    expect(faultFieldsOf(new TypeError('It is not a function.'))).toEqual({
      error: 'TypeError',
      detail: 'It is not a function.',
      code: null,
    });
  });

  it('should keep a thing that is no error as text', () => {
    expect(faultFieldsOf({ thrown: true })).toEqual({
      error: 'not an error',
      detail: '[object Object]',
      code: null,
    });
  });
});
