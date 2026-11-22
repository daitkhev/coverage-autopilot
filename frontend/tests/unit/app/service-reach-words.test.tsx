import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION } from '@coverage-autopilot/api-contracts/health';

import { reachLinesOf, reachWordsOf } from '#app/service-reach-words';

const LOG = '/home/user/.coverage-autopilot/service.log';
const OLDER = CONTRACT_VERSION - 1;

describe('reachWordsOf', () => {
  it('should keep what a service that did not start wrote, and where', () => {
    const words = reachWordsOf({
      outcome: 'did_not_start',
      lines: ['AUTOPILOT_QUEUE_POLL_MS: expected a whole number.'],
      log: LOG,
    });

    expect(words).toEqual({
      headline: 'The service did not start.',
      code: 'did_not_start',
      said: ['AUTOPILOT_QUEUE_POLL_MS: expected a whole number.'],
      next: `The rest is in ${LOG}.`,
    });
  });

  it('should say which work a service of another version runs', () => {
    const words = reachWordsOf({
      outcome: 'busy_with_another_version',
      contractVersion: OLDER,
      activeWork: { scans: 1, improvements: 2 },
    });

    expect(words.headline).toBe(
      'A service of another version runs 2 improvements and 1 scan, ' +
        'so it is left as it is.',
    );
    expect(words.said).toEqual([
      `It speaks contract ${String(OLDER)}, ` +
        `and this client speaks ${String(CONTRACT_VERSION)}.`,
    ]);
  });

  it('should say a fault in its own words', () => {
    const fault = new Error('The answer does not match the contract.');

    expect(reachWordsOf({ outcome: 'fault', fault }).said).toEqual([
      'The answer does not match the contract.',
    ]);
  });

  it('should say a fault that is no error as it is', () => {
    expect(reachWordsOf({ outcome: 'fault', fault: 'cut' }).said).toEqual([
      'cut',
    ]);
  });
});

describe('reachLinesOf', () => {
  it('should give the same words as lines, in the order they are read', () => {
    const lines = reachLinesOf({
      outcome: 'did_not_start',
      lines: ['first', 'second'],
      log: LOG,
    });

    expect(lines).toEqual([
      'The service did not start.',
      'first',
      'second',
      `The rest is in ${LOG}.`,
    ]);
  });
});
