import { describe, expect, it } from 'vitest';

import { ApplicationError } from '#kernel/errors/application.error';

class StepConflictError extends ApplicationError {
  public readonly code = 'step_conflict';
  public readonly retryable = true;
}

describe('ApplicationError', () => {
  it('should carry the code, the flag and the name of its class', () => {
    const error = new StepConflictError('The step ran twice.');

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'StepConflictError',
      message: 'The step ran twice.',
      code: 'step_conflict',
      retryable: true,
    });
  });

  it('should keep the error that caused it', () => {
    const cause = new Error('busy');

    expect(new StepConflictError('x', { cause }).cause).toBe(cause);
  });
});
