import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import type {
  Health,
  StopServiceResult,
} from '@coverage-autopilot/api-contracts/health';
import type {
  ApproveImprovementRequest,
  BudgetSettings,
  Improvement,
  ImprovementList,
  ImprovementListQuery,
  ImprovementPatch,
  StartImprovementRequest,
} from '@coverage-autopilot/api-contracts/improvements';
import type {
  AccessCheck,
  ConnectRepositoryRequest,
  Repository,
  RepositoryList,
} from '@coverage-autopilot/api-contracts/repositories';
import type { RequestKey } from '@coverage-autopilot/api-contracts/request-key';
import type { Scan } from '@coverage-autopilot/api-contracts/scans';
import type {
  SnapshotFiles,
  SnapshotFilesQuery,
  SnapshotList,
} from '@coverage-autopilot/api-contracts/snapshots';

/**
 * What the service answered: the value of the contract, or its refusal.
 * A refusal is an expected outcome, so it is a value: a status of 4xx or
 * 5xx with the error body of the contract. The status stays with both,
 * because 200 and 202 say whether the work was there already.
 */
export type ServiceAnswer<Value> =
  | {
      readonly outcome: 'answered';
      readonly status: number;
      readonly value: Value;
    }
  | {
      readonly outcome: 'refused';
      readonly status: number;
      readonly error: ErrorBody;
    };

/**
 * One method for each route of the service. Every method throws
 * `ServiceUnreachableError` when nothing answers on the socket,
 * `ServiceTimeoutError` when the service does not answer within the limit
 * of a request, and `ContractMismatchError` of the contracts when an
 * answer, a value or a refusal, does not match its schema: all are
 * faults.
 */
export interface ServiceApi {
  /**
   * `GET /health`. The route refuses nothing, so an answer that is not a
   * health does not match its schema.
   */
  health(): Promise<Health>;
  /** `POST /service/stop`: 202, or 409 `status_conflict` while work runs. */
  stopService(): Promise<ServiceAnswer<StopServiceResult>>;
  /**
   * `POST /repositories`: 201 for a new one, 200 for one connected
   * before; 400 for an address of no repository, 404 for one the login
   * cannot see.
   */
  connectRepository(
    request: ConnectRepositoryRequest,
  ): Promise<ServiceAnswer<Repository>>;
  /** `GET /repositories`. */
  listRepositories(): Promise<ServiceAnswer<RepositoryList>>;
  /** `GET /repositories/:id`: 200, 404. */
  getRepository(repositoryId: string): Promise<ServiceAnswer<Repository>>;
  /**
   * `GET /repositories/:id/access`: 200 also for a check that failed, with
   * `passed: false`; 404.
   */
  checkAccess(repositoryId: string): Promise<ServiceAnswer<AccessCheck>>;
  /**
   * `POST /repositories/:id/scans` with the key in `Idempotency-Key`: 202
   * for a new scan, 200 for the scan the key queued before; 404, 409
   * `request_key_reused`.
   */
  startScan(
    repositoryId: string,
    key: RequestKey,
  ): Promise<ServiceAnswer<Scan>>;
  /** `GET /scans/:id`: 200, 404. */
  getScan(scanId: string): Promise<ServiceAnswer<Scan>>;
  /** `POST /scans/:id/cancel`: 202, also for a scan that had ended; 404. */
  cancelScan(scanId: string): Promise<ServiceAnswer<Scan>>;
  /** `GET /repositories/:id/snapshots`, newest first: 200, 404. */
  listSnapshots(repositoryId: string): Promise<ServiceAnswer<SnapshotList>>;
  /**
   * `GET /snapshots/:id/files` with `below`, `metric` and `state` in the
   * query: 200, 404.
   */
  listSnapshotFiles(
    snapshotId: string,
    query?: SnapshotFilesQuery,
  ): Promise<ServiceAnswer<SnapshotFiles>>;
  /** `GET /settings/budget`. */
  getBudgetSettings(): Promise<ServiceAnswer<BudgetSettings>>;
  /**
   * `POST /improvements` with the key in `Idempotency-Key`: 202 for a new
   * improvement, 200 for the one a repeated request finds; 400, 404, 409.
   */
  startImprovement(
    request: StartImprovementRequest,
    key: RequestKey,
  ): Promise<ServiceAnswer<Improvement>>;
  /** `GET /improvements` with `repositoryId`, `status` and `filePath`. */
  listImprovements(
    query?: ImprovementListQuery,
  ): Promise<ServiceAnswer<ImprovementList>>;
  /** `GET /improvements/:id`: 200, 404. */
  getImprovement(improvementId: string): Promise<ServiceAnswer<Improvement>>;
  /**
   * `GET /improvements/:id/patch`: 200, 404, and 409 `status_conflict`
   * when no attempt was accepted.
   */
  getImprovementPatch(
    improvementId: string,
  ): Promise<ServiceAnswer<ImprovementPatch>>;
  /**
   * `POST /improvements/:id/approve`: 202; 404, and 409 for another hash
   * or a status that waits for no approval.
   */
  approveImprovement(
    improvementId: string,
    request: ApproveImprovementRequest,
  ): Promise<ServiceAnswer<Improvement>>;
  /**
   * `POST /improvements/:id/cancel` with the body `{}`, which this route
   * requires: 202, 200 for one that had ended; 404.
   */
  cancelImprovement(improvementId: string): Promise<ServiceAnswer<Improvement>>;
}
