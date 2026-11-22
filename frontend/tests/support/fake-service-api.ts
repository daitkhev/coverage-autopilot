import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';

import type { BrowserOpening } from '#api/browser';
import type { ClientSession } from '#api/client-session';
import type { ServiceAnswer, ServiceApi } from '#api/service-api';

/** One call of the fake, in the order it was made. */
interface RecordedCall {
  readonly method: keyof ServiceApi;
  readonly arguments: readonly unknown[];
}

/** A `ServiceApi` that answers as a test scripted it. */
export interface FakeServiceApi extends ServiceApi {
  /** Every call, scripted or not, in the order it was made. */
  readonly calls: readonly RecordedCall[];
}

/** A session over the fake, whose moment a test moves. */
export interface FakeSession extends ClientSession {
  readonly api: FakeServiceApi;
  /** Notes the address and says the browser started. No browser starts. */
  readonly openInBrowser: (address: string) => Promise<BrowserOpening>;
  /** Every address the session was asked to show, in order. */
  readonly pages: readonly string[];
  /** `now` answers with this moment from here on. */
  readonly moveTo: (moment: string) => void;
}

/** The moment a fake session starts at. The samples are as old as it says. */
export const SAMPLE_NOW = '2026-11-21T14:05:00.000Z';

/** A second before `SAMPLE_NOW`: when an answer that is fresh came. */
export const SECOND_AGO = '2026-11-21T14:04:59.000Z';

const OK = 200;

/** An answer of the service with the value of its contract. */
export function answered<Value>(
  value: Value,
  status = OK,
): ServiceAnswer<Value> {
  return { outcome: 'answered', status, value };
}

/** A refusal of the service, which fits the answer of every route. */
export function refused(
  status: number,
  error: ErrorBody,
): ServiceAnswer<never> {
  return { outcome: 'refused', status, error };
}

/**
 * A `ServiceApi` whose methods are the scripted ones. Every other method
 * rejects with an error that names it, so a test sees the call it did
 * not expect. Each method is written out, so a route added to the
 * interface does not compile here until the fake has it.
 */
export function fakeServiceApi(scripted: Partial<ServiceApi>): FakeServiceApi {
  const calls: RecordedCall[] = [];
  const take = <Method extends keyof ServiceApi>(
    method: Method,
    args: readonly unknown[],
  ): ServiceApi[Method] => {
    calls.push({ method, arguments: args });
    const answer = scripted[method];
    if (answer === undefined) {
      throw new Error(`The test scripted no answer for ${method}.`);
    }
    return answer;
  };
  return {
    calls,
    health: async (...args) => take('health', args)(...args),
    stopService: async (...args) => take('stopService', args)(...args),
    connectRepository: async (...args) =>
      take('connectRepository', args)(...args),
    listRepositories: async (...args) =>
      take('listRepositories', args)(...args),
    getRepository: async (...args) => take('getRepository', args)(...args),
    checkAccess: async (...args) => take('checkAccess', args)(...args),
    startScan: async (...args) => take('startScan', args)(...args),
    getScan: async (...args) => take('getScan', args)(...args),
    cancelScan: async (...args) => take('cancelScan', args)(...args),
    listSnapshots: async (...args) => take('listSnapshots', args)(...args),
    listSnapshotFiles: async (...args) =>
      take('listSnapshotFiles', args)(...args),
    getBudgetSettings: async (...args) =>
      take('getBudgetSettings', args)(...args),
    startImprovement: async (...args) =>
      take('startImprovement', args)(...args),
    listImprovements: async (...args) =>
      take('listImprovements', args)(...args),
    getImprovement: async (...args) => take('getImprovement', args)(...args),
    getImprovementPatch: async (...args) =>
      take('getImprovementPatch', args)(...args),
    approveImprovement: async (...args) =>
      take('approveImprovement', args)(...args),
    cancelImprovement: async (...args) =>
      take('cancelImprovement', args)(...args),
  };
}

/** A session over the fake, at a fixed moment a test can move, in UTC. */
export function fakeSession(
  scripted: Partial<ServiceApi>,
  moment = SAMPLE_NOW,
): FakeSession {
  let current = moment;
  const pages: string[] = [];
  return {
    api: fakeServiceApi(scripted),
    now: () => current,
    timeZone: 'UTC',
    openInBrowser: async (address) => {
      pages.push(address);
      return Promise.resolve({ outcome: 'started' });
    },
    pages,
    moveTo: (next) => {
      current = next;
    },
  };
}
