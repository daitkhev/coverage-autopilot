import { describe, expect, it } from 'vitest';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import type { BudgetSettings } from '@coverage-autopilot/api-contracts/improvements';

import {
  answered,
  type FakeServiceApi,
  fakeServiceApi,
  type FakeSession,
  fakeSession,
  refused,
  SAMPLE_NOW,
} from '#tests/support/fake-service-api';

const BUDGET: BudgetSettings = {
  defaults: { attempts: 3, tokens: null, minutes: 30 },
  maximums: { attempts: 10, tokens: null, minutes: 120 },
};

const KEY = 'key-1';

describe('fakeServiceApi', () => {
  it('should answer a call with what the test scripted', async () => {
    const api = fakeServiceApi({
      getBudgetSettings: () => Promise.resolve(answered(BUDGET)),
    });

    await expect(api.getBudgetSettings()).resolves.toEqual({
      outcome: 'answered',
      status: 200,
      value: BUDGET,
    });
  });

  it('should record every call in order, with its arguments', async () => {
    const api: FakeServiceApi = fakeServiceApi({
      startScan: () => Promise.reject(new Error('busy')),
      getScan: () => Promise.reject(new Error('gone')),
    });

    await expect(api.startScan('repo-1', KEY)).rejects.toThrow('busy');
    await expect(api.getScan('scan-1')).rejects.toThrow('gone');

    expect(api.calls).toEqual([
      { method: 'startScan', arguments: ['repo-1', KEY] },
      { method: 'getScan', arguments: ['scan-1'] },
    ]);
  });

  describe('when a call was not scripted', () => {
    it('should reject it with an error that names it', async () => {
      const api = fakeServiceApi({});

      await expect(api.cancelImprovement('imp-1')).rejects.toThrow(
        'The test scripted no answer for cancelImprovement.',
      );
      expect(api.calls).toEqual([
        { method: 'cancelImprovement', arguments: ['imp-1'] },
      ]);
    });
  });
});

describe('answered', () => {
  it('should carry the status it is given', () => {
    expect(answered(BUDGET, 202)).toEqual({
      outcome: 'answered',
      status: 202,
      value: BUDGET,
    });
  });
});

describe('refused', () => {
  it('should carry the status and the body of the refusal', () => {
    const error: ErrorBody = {
      error: 'not_found',
      message: 'No scan has this id.',
    };

    expect(refused(404, error)).toEqual({
      outcome: 'refused',
      status: 404,
      error,
    });
  });
});

describe('fakeSession', () => {
  it('should answer with the sample moment in UTC', () => {
    const session: FakeSession = fakeSession({});

    expect(session.now()).toBe(SAMPLE_NOW);
    expect(session.timeZone).toBe('UTC');
  });

  it('should answer with the moment the test moved it to', () => {
    const session = fakeSession({}, '2026-11-21T14:05:00.000Z');

    session.moveTo('2026-11-21T14:05:11.000Z');

    expect(session.now()).toBe('2026-11-21T14:05:11.000Z');
  });

  it('should hand the calls to the fake it holds', async () => {
    const session = fakeSession({
      getBudgetSettings: () => Promise.resolve(answered(BUDGET)),
    });

    await session.api.getBudgetSettings();

    expect(session.api.calls).toEqual([
      { method: 'getBudgetSettings', arguments: [] },
    ]);
  });
});
