import {
  healthSchema,
  stopServiceResultSchema,
} from '@coverage-autopilot/api-contracts/health';
import {
  budgetSettingsSchema,
  improvementListSchema,
  improvementPatchSchema,
  improvementSchema,
} from '@coverage-autopilot/api-contracts/improvements';
import {
  accessCheckSchema,
  repositoryListSchema,
  repositorySchema,
} from '@coverage-autopilot/api-contracts/repositories';
import { scanSchema } from '@coverage-autopilot/api-contracts/scans';
import {
  snapshotFilesSchema,
  snapshotListSchema,
} from '@coverage-autopilot/api-contracts/snapshots';

import {
  getRequest,
  pathOf,
  postRequest,
  type SocketRequest,
  withQuery,
} from '#api/route-requests';
import {
  answerOf,
  type ContractSchema,
  type ValueOf,
  valueOf,
} from '#api/service-answers';
import type { ServiceAnswer, ServiceApi } from '#api/service-api';
import { exchange } from '#api/socket-exchange';

/** Sends a request, and reads its answer with the schema of its route. */
type Ask = <Schema extends ContractSchema>(
  schema: Schema,
  sent: SocketRequest,
) => Promise<ServiceAnswer<ValueOf<Schema>>>;

/**
 * The cancel of an improvement reads its body as an empty object, so a
 * request with no body at all is refused.
 */
const EMPTY_BODY = {};

type ServiceRoutes = Pick<ServiceApi, 'stopService' | 'getBudgetSettings'>;

function serviceRoutes(ask: Ask): ServiceRoutes {
  return {
    stopService: async () =>
      ask(stopServiceResultSchema, postRequest(pathOf('service', 'stop'))),
    getBudgetSettings: async () =>
      ask(budgetSettingsSchema, getRequest(pathOf('settings', 'budget'))),
  };
}

type RepositoryRoutes = Pick<
  ServiceApi,
  | 'connectRepository'
  | 'listRepositories'
  | 'getRepository'
  | 'checkAccess'
  | 'startScan'
  | 'listSnapshots'
>;

function repositoryRoutes(ask: Ask): RepositoryRoutes {
  const repository = (id: string, ...rest: string[]): string =>
    pathOf('repositories', id, ...rest);
  return {
    connectRepository: async (request) =>
      ask(
        repositorySchema,
        postRequest(pathOf('repositories'), { body: request }),
      ),
    listRepositories: async () =>
      ask(repositoryListSchema, getRequest(pathOf('repositories'))),
    getRepository: async (id) =>
      ask(repositorySchema, getRequest(repository(id))),
    checkAccess: async (id) =>
      ask(accessCheckSchema, getRequest(repository(id, 'access'))),
    startScan: async (id, key) =>
      ask(scanSchema, postRequest(repository(id, 'scans'), { key })),
    listSnapshots: async (id) =>
      ask(snapshotListSchema, getRequest(repository(id, 'snapshots'))),
  };
}

type ScanRoutes = Pick<
  ServiceApi,
  'getScan' | 'cancelScan' | 'listSnapshotFiles'
>;

function scanRoutes(ask: Ask): ScanRoutes {
  return {
    getScan: async (id) => ask(scanSchema, getRequest(pathOf('scans', id))),
    cancelScan: async (id) =>
      ask(scanSchema, postRequest(pathOf('scans', id, 'cancel'))),
    listSnapshotFiles: async (id, query) =>
      ask(
        snapshotFilesSchema,
        getRequest(withQuery(pathOf('snapshots', id, 'files'), query)),
      ),
  };
}

type ImprovementRoutes = Pick<
  ServiceApi,
  | 'startImprovement'
  | 'listImprovements'
  | 'getImprovement'
  | 'getImprovementPatch'
  | 'approveImprovement'
  | 'cancelImprovement'
>;

function improvementRoutes(ask: Ask): ImprovementRoutes {
  const improvement = (id: string, ...rest: string[]): string =>
    pathOf('improvements', id, ...rest);
  return {
    startImprovement: async (request, key) =>
      ask(
        improvementSchema,
        postRequest(pathOf('improvements'), { body: request, key }),
      ),
    listImprovements: async (query) =>
      ask(
        improvementListSchema,
        getRequest(withQuery(pathOf('improvements'), query)),
      ),
    getImprovement: async (id) =>
      ask(improvementSchema, getRequest(improvement(id))),
    getImprovementPatch: async (id) =>
      ask(improvementPatchSchema, getRequest(improvement(id, 'patch'))),
    approveImprovement: async (id, request) =>
      ask(
        improvementSchema,
        postRequest(improvement(id, 'approve'), { body: request }),
      ),
    cancelImprovement: async (id) =>
      ask(
        improvementSchema,
        postRequest(improvement(id, 'cancel'), { body: EMPTY_BODY }),
      ),
  };
}

/**
 * The service over its socket: every route of the contract, each answer
 * read with the schema of that route. What each route sends and answers
 * is in the documentation of `ServiceApi`.
 */
export function socketServiceApi(socketPath: string): ServiceApi {
  const ask: Ask = async (schema, sent) =>
    answerOf(schema, await exchange(socketPath, sent));
  return {
    health: async () =>
      valueOf(
        healthSchema,
        await exchange(socketPath, getRequest(pathOf('health'))),
      ),
    ...serviceRoutes(ask),
    ...repositoryRoutes(ask),
    ...scanRoutes(ask),
    ...improvementRoutes(ask),
  };
}
