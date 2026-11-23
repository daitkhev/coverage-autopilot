import type { ServiceApi } from '#api/service-api';
import {
  answered,
  type FakeSession,
  fakeSession,
} from '#tests/support/fake-service-api';
import { PAYMENTS_FILES } from '#tests/support/sample-files';
import {
  IMPROVEMENT_BY_STATUS,
  IMPROVEMENT_LIST,
  PATCH_AWAITING_APPROVAL,
} from '#tests/support/sample-improvements';
import {
  ACCESS_PASSED,
  BUDGET_SETTINGS,
  IDLE_HEALTH,
  PAYMENTS_SNAPSHOTS,
  REPOSITORY_LIST,
  SCAN_BY_STATUS,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';

/**
 * A service that answers every question a screen asks, so the app can be
 * walked from screen to screen. A test scripts over it what it is about.
 */
export function wholeSession(scripted: Partial<ServiceApi> = {}): FakeSession {
  return fakeSession({
    health: () => Promise.resolve(IDLE_HEALTH),
    listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
    getRepository: () => Promise.resolve(answered(SCANNED_REPOSITORY)),
    checkAccess: () => Promise.resolve(answered(ACCESS_PASSED)),
    getScan: () => Promise.resolve(answered(SCAN_BY_STATUS.running)),
    listSnapshots: () => Promise.resolve(answered(PAYMENTS_SNAPSHOTS)),
    listSnapshotFiles: () => Promise.resolve(answered(PAYMENTS_FILES)),
    getBudgetSettings: () => Promise.resolve(answered(BUDGET_SETTINGS)),
    listImprovements: () => Promise.resolve(answered(IMPROVEMENT_LIST)),
    getImprovement: () =>
      Promise.resolve(answered(IMPROVEMENT_BY_STATUS.awaiting_approval)),
    getImprovementPatch: () =>
      Promise.resolve(answered(PATCH_AWAITING_APPROVAL)),
    ...scripted,
  });
}
