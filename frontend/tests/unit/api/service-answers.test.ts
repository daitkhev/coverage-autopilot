import { describe, expect, it } from 'vitest';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import { budgetSettingsSchema } from '@coverage-autopilot/api-contracts/improvements';
import { ContractMismatchError } from '@coverage-autopilot/api-contracts/parsing';

import { answerOf, jsonOf, valueOf } from '#api/service-answers';
import { BUDGET_SETTINGS } from '#tests/support/sample-repositories';

const CONFLICT: ErrorBody = {
  error: 'status_conflict',
  message: '2 jobs are running.',
};

function reply(
  status: number,
  body: unknown,
): { status: number; text: string } {
  return { status, text: JSON.stringify(body) };
}

describe('jsonOf', () => {
  it('should read a body of JSON', () => {
    expect(jsonOf('{"a":[1]}')).toEqual({ a: [1] });
  });

  describe('when the body is not JSON', () => {
    it('should read no value', () => {
      expect(jsonOf('<html>')).toBeUndefined();
      expect(jsonOf('')).toBeUndefined();
    });
  });
});

describe('valueOf', () => {
  it('should read the body with the schema, whatever the status', () => {
    expect(valueOf(budgetSettingsSchema, reply(500, BUDGET_SETTINGS))).toEqual(
      BUDGET_SETTINGS,
    );
  });

  describe('when the body does not match', () => {
    it('should throw a mismatch of the contract', () => {
      expect(() => valueOf(budgetSettingsSchema, reply(200, {}))).toThrow(
        ContractMismatchError,
      );
    });
  });
});

describe('answerOf', () => {
  it('should answer the value of the route below 400', () => {
    expect(answerOf(budgetSettingsSchema, reply(399, BUDGET_SETTINGS))).toEqual(
      { outcome: 'answered', status: 399, value: BUDGET_SETTINGS },
    );
  });

  it('should answer the refusal of the contract from 400 on', () => {
    expect(answerOf(budgetSettingsSchema, reply(400, CONFLICT))).toEqual({
      outcome: 'refused',
      status: 400,
      error: CONFLICT,
    });
  });

  describe('when the body is not what the status says', () => {
    it('should throw a mismatch of the contract', () => {
      expect(() =>
        answerOf(budgetSettingsSchema, reply(200, CONFLICT)),
      ).toThrow(ContractMismatchError);
      expect(() =>
        answerOf(budgetSettingsSchema, reply(409, BUDGET_SETTINGS)),
      ).toThrow(ContractMismatchError);
    });
  });

  describe('when the body is not JSON', () => {
    it('should throw a mismatch of the contract', () => {
      expect(() =>
        answerOf(budgetSettingsSchema, { status: 200, text: 'ok' }),
      ).toThrow(ContractMismatchError);
    });
  });
});
