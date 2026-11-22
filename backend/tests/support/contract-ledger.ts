import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { healthSchema } from '@coverage-autopilot/api-contracts/health';
import {
  budgetSettingsSchema,
  improvementListSchema,
  improvementPatchSchema,
  improvementSchema,
} from '@coverage-autopilot/api-contracts/improvements';
import type { parseAs } from '@coverage-autopilot/api-contracts/parsing';
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

import { askOver } from '#tests/support/service-bench';

export const OK = 200;
export const CREATED = 201;
export const ACCEPTED = 202;
export const CONFLICT = 409;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;

/** An answer is cut to this many characters in a finding. */
const SHOWN_CHARACTERS = 600;

/** The status and the body of an answer, read as JSON. */
export type Answer = Awaited<ReturnType<typeof askOver>>;

/** A request a client sends. Left out, it is a `GET` with no body. */
export type Asked = NonNullable<Parameters<typeof askOver>[2]>;

type Method = NonNullable<Asked['method']>;

/** A schema of the contract, as the service and the client read with it. */
type Schema = Parameters<typeof parseAs>[0];

/** The schema of the body of each status a route may answer with. */
type Answers = Readonly<Partial<Record<number, Schema>>>;

interface RouteContract {
  readonly method: Method;
  readonly path: RegExp;
  readonly answers: Answers;
}

/** A route that refuses answers in the one shape of an error. */
function refusals(...statuses: readonly number[]): Answers {
  return Object.fromEntries(statuses.map((status) => [status, errorSchema]));
}

/** `:id` stands for one part of a path, and a query may follow. */
function route(
  method: Method,
  template: string,
  answers: Answers,
): RouteContract {
  const pattern = template.replaceAll(':id', '[^/?]+');
  return { method, path: new RegExp(`^${pattern}(?:\\?.*)?$`, 'u'), answers };
}

/**
 * Every route of the service with the statuses the routes of the design
 * and the contract name for it: the answers of success, 400 for a request
 * that breaks its schema, 404 for what is not there and 409 for a
 * conflict. A 500 is a fault, and no route names it.
 */
const ROUTES: readonly RouteContract[] = [
  route('GET', '/health', { [OK]: healthSchema }),
  route('GET', '/settings/budget', { [OK]: budgetSettingsSchema }),
  route('POST', '/repositories', {
    [CREATED]: repositorySchema,
    [OK]: repositorySchema,
    ...refusals(BAD_REQUEST, NOT_FOUND),
  }),
  route('GET', '/repositories', { [OK]: repositoryListSchema }),
  route('GET', '/repositories/:id', {
    [OK]: repositorySchema,
    ...refusals(BAD_REQUEST, NOT_FOUND),
  }),
  route('GET', '/repositories/:id/access', {
    [OK]: accessCheckSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND),
  }),
  route('POST', '/repositories/:id/scans', {
    [ACCEPTED]: scanSchema,
    [OK]: scanSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND, CONFLICT),
  }),
  route('GET', '/repositories/:id/snapshots', {
    [OK]: snapshotListSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND),
  }),
  route('GET', '/scans/:id', {
    [OK]: scanSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND),
  }),
  route('POST', '/scans/:id/cancel', {
    [ACCEPTED]: scanSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND),
  }),
  route('GET', '/snapshots/:id/files', {
    [OK]: snapshotFilesSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND),
  }),
  route('POST', '/improvements', {
    [ACCEPTED]: improvementSchema,
    [OK]: improvementSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND, CONFLICT),
  }),
  route('GET', '/improvements', {
    [OK]: improvementListSchema,
    ...refusals(BAD_REQUEST),
  }),
  route('GET', '/improvements/:id', {
    [OK]: improvementSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND),
  }),
  route('GET', '/improvements/:id/patch', {
    [OK]: improvementPatchSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND, CONFLICT),
  }),
  route('POST', '/improvements/:id/approve', {
    [ACCEPTED]: improvementSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND, CONFLICT),
  }),
  route('POST', '/improvements/:id/cancel', {
    [ACCEPTED]: improvementSchema,
    [OK]: improvementSchema,
    ...refusals(BAD_REQUEST, NOT_FOUND),
  }),
];

function shown(body: unknown): string {
  return JSON.stringify(body).slice(0, SHOWN_CHARACTERS);
}

/** What breaks the contract in an answer, or `null` when nothing does. */
function breachOf(method: Method, path: string, answer: Answer): string | null {
  const request = `${method} ${path}`;
  const contract = ROUTES.find(
    (candidate) => candidate.method === method && candidate.path.test(path),
  );
  if (contract === undefined) {
    return `${request} is no route of the contract.`;
  }
  const schema = contract.answers[answer.status];
  if (schema === undefined) {
    return (
      `${request} answered ${String(answer.status)}, which the contract ` +
      `does not name for it: ${shown(answer.body)}`
    );
  }
  const parsed = schema.safeParse(answer.body);
  return parsed.success
    ? null
    : `${request} answered ${String(answer.status)} with a body the ` +
        `contract refuses: ${parsed.error.message.slice(0, SHOWN_CHARACTERS)}`;
}

/**
 * Sends every request of a run over the socket of the service and judges
 * each answer against the contract of its route, so no answer of the run
 * goes unseen. A request that got no answer at all is a breach too.
 */
export class ContractLedger {
  private readonly socket: string;
  private readonly breaches: string[] = [];
  private sent = 0;

  public constructor(socket: string) {
    this.socket = socket;
  }

  /** How many requests were sent so far. */
  public get count(): number {
    return this.sent;
  }

  public findings(): string[] {
    return [...this.breaches];
  }

  public async send(path: string, asked: Asked = {}): Promise<Answer> {
    const method = asked.method ?? 'GET';
    this.sent += 1;
    try {
      const answer = await askOver(this.socket, path, asked);
      const breach = breachOf(method, path, answer);
      if (breach !== null) {
        this.breaches.push(breach);
      }
      return answer;
    } catch (error) {
      this.breaches.push(`${method} ${path} got no answer: ${String(error)}`);
      throw error;
    }
  }
}
