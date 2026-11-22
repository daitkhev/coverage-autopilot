import { describe, expect, it } from 'vitest';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';

import type { ServiceApi } from '#api/service-api';
import {
  connectAndCheck,
  type ConnectPhase,
  isEditable,
} from '#screens/repositories/connect-flow';
import {
  answered,
  fakeServiceApi,
  refused,
  SAMPLE_NOW,
} from '#tests/support/fake-service-api';
import {
  ACCESS_PASSED,
  ACCESS_REFUSED,
  NEVER_SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';

const ADDRESS = 'https://github.com/example/notifier';
const CREATED = 201;

const NOT_FOUND: ErrorBody = {
  error: 'not_found',
  message: 'No repository was found at this address.',
};

/** Connects with the scripted service, and every phase it reported. */
async function connectWith(scripted: Partial<ServiceApi>) {
  const phases: ConnectPhase[] = [];
  const repository = await connectAndCheck({
    api: fakeServiceApi(scripted),
    url: ADDRESS,
    since: SAMPLE_NOW,
    report: (phase) => {
      phases.push(phase);
    },
  });
  return { repository, steps: phases.map((phase) => phase.step), phases };
}

const CONNECTED: Partial<ServiceApi> = {
  connectRepository: () =>
    Promise.resolve(answered(NEVER_SCANNED_REPOSITORY, CREATED)),
};

describe('connectAndCheck', () => {
  it('should give the repository once every step passed', async () => {
    const { repository, steps } = await connectWith({
      ...CONNECTED,
      checkAccess: () => Promise.resolve(answered(ACCESS_PASSED)),
    });

    expect(repository).toBe(NEVER_SCANNED_REPOSITORY);
    expect(steps).toEqual(['connecting', 'checking']);
  });

  it('should report what the service refused the address with', async () => {
    const { repository, phases } = await connectWith({
      connectRepository: () => Promise.resolve(refused(404, NOT_FOUND)),
    });

    expect(repository).toBeUndefined();
    expect(phases.at(-1)).toEqual({
      step: 'refused',
      refusal: { kind: 'refused', status: 404, error: NOT_FOUND },
    });
  });

  it('should report what the service refused the check with', async () => {
    const { repository, steps } = await connectWith({
      ...CONNECTED,
      checkAccess: () => Promise.resolve(refused(404, NOT_FOUND)),
    });

    expect(repository).toBeUndefined();
    expect(steps).toEqual(['connecting', 'checking', 'refused']);
  });

  it('should report the steps of a check that failed', async () => {
    const { repository, phases } = await connectWith({
      ...CONNECTED,
      checkAccess: () => Promise.resolve(answered(ACCESS_REFUSED)),
    });

    expect(repository).toBeUndefined();
    expect(phases.at(-1)).toEqual({
      step: 'refused',
      refusal: {
        kind: 'access',
        repository: NEVER_SCANNED_REPOSITORY,
        check: ACCESS_REFUSED,
      },
    });
  });
});

describe('isEditable', () => {
  it.each([
    { phase: { step: 'editing' }, editable: true },
    { phase: { step: 'connecting', since: SAMPLE_NOW }, editable: false },
    {
      phase: {
        step: 'checking',
        since: SAMPLE_NOW,
        repository: NEVER_SCANNED_REPOSITORY,
      },
      editable: false,
    },
    {
      phase: { step: 'refused', refusal: { kind: 'fault', fault: 'x' } },
      editable: true,
    },
  ] satisfies readonly { phase: ConnectPhase; editable: boolean }[])(
    'should say whether $phase.step can be typed in',
    ({ phase, editable }) => {
      expect(isEditable(phase)).toBe(editable);
    },
  );
});
