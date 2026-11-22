import type { ServiceAnswer, ServiceApi } from '#api/service-api';
import { ACCEPTED_HASH } from '#tests/support/sample-attempts';
import { PAYMENTS_FILES } from '#tests/support/sample-files';
import {
  IMPROVEMENT_BY_STATUS,
  IMPROVEMENT_LIST,
  PATCH_AWAITING_APPROVAL,
} from '#tests/support/sample-improvements';
import {
  ACCESS_PASSED,
  BUDGET_SETTINGS,
  PAYMENTS_SNAPSHOT,
  PAYMENTS_SNAPSHOTS,
  REPOSITORY_LIST,
  SCAN_BY_STATUS,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';

/** One route as the socket client sends it, and a value it answers with. */
export interface RouteCase {
  readonly name: keyof ServiceApi;
  readonly call: (api: ServiceApi) => Promise<ServiceAnswer<unknown>>;
  readonly method: 'GET' | 'POST';
  /** The path with its query, as the service receives it. */
  readonly url: string;
  /** The body as it is sent, empty for none. */
  readonly body: string;
  /** The request key a command that starts work carries. */
  readonly key?: string;
  readonly status: number;
  readonly value: unknown;
}

/** The key every command of the table that starts work carries. */
const KEY = 'key-of-the-test';

const OK = 200;
const CREATED = 201;
const ACCEPTED = 202;

/** The threshold the files of the table are asked below. */
const BELOW_PERCENT = 80;

const REPOSITORY = SCANNED_REPOSITORY.id;
const SNAPSHOT = PAYMENTS_SNAPSHOT.id;
const AWAITING = IMPROVEMENT_BY_STATUS.awaiting_approval.id;
const FAILED = IMPROVEMENT_BY_STATUS.failed;
const NEW_IMPROVEMENT = {
  snapshotId: SNAPSHOT,
  filePath: 'src/billing/invoice.ts',
  mode: 'review',
} as const;

/** Every route but the health, as the controllers of the service read it. */
export const ROUTES: readonly RouteCase[] = [
  {
    name: 'stopService',
    call: async (api) => api.stopService(),
    method: 'POST',
    url: '/service/stop',
    body: '',
    status: ACCEPTED,
    value: { stopping: true },
  },
  {
    name: 'connectRepository',
    call: async (api) => api.connectRepository({ url: SCANNED_REPOSITORY.url }),
    method: 'POST',
    url: '/repositories',
    body: JSON.stringify({ url: SCANNED_REPOSITORY.url }),
    status: CREATED,
    value: SCANNED_REPOSITORY,
  },
  {
    name: 'listRepositories',
    call: async (api) => api.listRepositories(),
    method: 'GET',
    url: '/repositories',
    body: '',
    status: OK,
    value: REPOSITORY_LIST,
  },
  {
    name: 'getRepository',
    call: async (api) => api.getRepository(REPOSITORY),
    method: 'GET',
    url: `/repositories/${REPOSITORY}`,
    body: '',
    status: OK,
    value: SCANNED_REPOSITORY,
  },
  {
    name: 'checkAccess',
    call: async (api) => api.checkAccess(REPOSITORY),
    method: 'GET',
    url: `/repositories/${REPOSITORY}/access`,
    body: '',
    status: OK,
    value: ACCESS_PASSED,
  },
  {
    name: 'startScan',
    call: async (api) => api.startScan(REPOSITORY, KEY),
    method: 'POST',
    url: `/repositories/${REPOSITORY}/scans`,
    body: '',
    key: KEY,
    status: ACCEPTED,
    value: SCAN_BY_STATUS.queued,
  },
  {
    name: 'getScan',
    call: async (api) => api.getScan(SCAN_BY_STATUS.running.id),
    method: 'GET',
    url: `/scans/${SCAN_BY_STATUS.running.id}`,
    body: '',
    status: OK,
    value: SCAN_BY_STATUS.running,
  },
  {
    name: 'cancelScan',
    call: async (api) => api.cancelScan(SCAN_BY_STATUS.cancelled.id),
    method: 'POST',
    url: `/scans/${SCAN_BY_STATUS.cancelled.id}/cancel`,
    body: '',
    status: ACCEPTED,
    value: SCAN_BY_STATUS.cancelled,
  },
  {
    name: 'listSnapshots',
    call: async (api) => api.listSnapshots(REPOSITORY),
    method: 'GET',
    url: `/repositories/${REPOSITORY}/snapshots`,
    body: '',
    status: OK,
    value: PAYMENTS_SNAPSHOTS,
  },
  {
    name: 'listSnapshotFiles',
    call: async (api) =>
      api.listSnapshotFiles(SNAPSHOT, {
        below: BELOW_PERCENT,
        metric: 'lines',
        state: 'measured',
      }),
    method: 'GET',
    url:
      `/snapshots/${SNAPSHOT}/files?below=${String(BELOW_PERCENT)}` +
      '&metric=lines&state=measured',
    body: '',
    status: OK,
    value: PAYMENTS_FILES,
  },
  {
    name: 'getBudgetSettings',
    call: async (api) => api.getBudgetSettings(),
    method: 'GET',
    url: '/settings/budget',
    body: '',
    status: OK,
    value: BUDGET_SETTINGS,
  },
  {
    name: 'startImprovement',
    call: async (api) => api.startImprovement(NEW_IMPROVEMENT, KEY),
    method: 'POST',
    url: '/improvements',
    body: JSON.stringify(NEW_IMPROVEMENT),
    key: KEY,
    status: ACCEPTED,
    value: IMPROVEMENT_BY_STATUS.created,
  },
  {
    name: 'listImprovements',
    call: async (api) =>
      api.listImprovements({
        repositoryId: REPOSITORY,
        status: 'failed',
        filePath: FAILED.targetFile,
      }),
    method: 'GET',
    url:
      `/improvements?repositoryId=${REPOSITORY}&status=failed` +
      `&filePath=${encodeURIComponent(FAILED.targetFile)}`,
    body: '',
    status: OK,
    value: IMPROVEMENT_LIST,
  },
  {
    name: 'getImprovement',
    call: async (api) => api.getImprovement(FAILED.id),
    method: 'GET',
    url: `/improvements/${FAILED.id}`,
    body: '',
    status: OK,
    value: FAILED,
  },
  {
    name: 'getImprovementPatch',
    call: async (api) => api.getImprovementPatch(AWAITING),
    method: 'GET',
    url: `/improvements/${AWAITING}/patch`,
    body: '',
    status: OK,
    value: PATCH_AWAITING_APPROVAL,
  },
  {
    name: 'approveImprovement',
    call: async (api) =>
      api.approveImprovement(AWAITING, { patchHash: ACCEPTED_HASH }),
    method: 'POST',
    url: `/improvements/${AWAITING}/approve`,
    body: JSON.stringify({ patchHash: ACCEPTED_HASH }),
    status: ACCEPTED,
    value: IMPROVEMENT_BY_STATUS.publishing,
  },
  {
    name: 'cancelImprovement',
    call: async (api) => api.cancelImprovement(FAILED.id),
    method: 'POST',
    url: `/improvements/${FAILED.id}/cancel`,
    body: '{}',
    status: OK,
    value: FAILED,
  },
];
