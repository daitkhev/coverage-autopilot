import {
  type Health,
  healthSchema,
} from '@coverage-autopilot/api-contracts/health';

import { pollUntil, type Waiting } from '#api/polling';
import { getRequest, pathOf } from '#api/route-requests';
import { type SocketReply, valueOf } from '#api/service-answers';
import type { ServiceApi } from '#api/service-api';
import {
  type LaunchedService,
  type LaunchRequest,
  launchService,
} from '#api/service-launch';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { exchange } from '#api/socket-exchange';
import { socketServiceApi } from '#api/socket-service-api';

/** A step on the way to a service, for a screen to say while it lasts. */
export type ServiceStep = 'starting' | 'stopping_the_old_one';

/** Everything the client is given to reach a service, and never the process. */
export interface ServiceStartOptions extends LaunchRequest, Waiting {
  /** Told of each step as it begins. */
  readonly observe: (step: ServiceStep) => void;
}

/** A service of this contract answers on the socket. */
export interface ReadyService {
  readonly outcome: 'ready';
  readonly api: ServiceApi;
  readonly health: Health;
}

/** The service did not answer in time, or its process failed. */
export interface ServiceDidNotStart {
  readonly outcome: 'did_not_start';
  /** The last lines it wrote, which say why when it said anything. */
  readonly lines: readonly string[];
  /** Where it writes, for a person to read the rest. */
  readonly log: string;
}

/** What the health of the service on the socket answered. */
export async function healthReply(socket: string): Promise<SocketReply> {
  return exchange(socket, getRequest(pathOf('health')));
}

/** The answer of the health, or nothing when nothing answers. */
export async function lookForService(
  socket: string,
): Promise<SocketReply | undefined> {
  try {
    return await healthReply(socket);
  } catch (error) {
    if (error instanceof ServiceUnreachableError) {
      return undefined;
    }
    throw error;
  }
}

/** The service on the socket, whose health of this contract is the reply. */
export function readyService(socket: string, reply: SocketReply): ReadyService {
  return {
    outcome: 'ready',
    api: socketServiceApi(socket),
    health: valueOf(healthSchema, reply),
  };
}

/**
 * Waits until a service answers on the socket, and reads its health. A
 * service the client started is of its own package, so the version is not
 * compared again.
 */
async function answerAfterStart(
  options: ServiceStartOptions,
  launched: LaunchedService,
): Promise<ReadyService | ServiceDidNotStart> {
  const { socket, log } = options.location;
  let reply: SocketReply | undefined;
  await pollUntil(options, async () => {
    reply = await lookForService(socket);
    return reply !== undefined || launched.failed();
  });
  return reply === undefined
    ? { outcome: 'did_not_start', lines: await launched.lines(), log }
    : readyService(socket, reply);
}

/** Starts a service where nothing answers, and waits for it to answer. */
export async function startService(
  options: ServiceStartOptions,
): Promise<ReadyService | ServiceDidNotStart> {
  options.observe('starting');
  return answerAfterStart(options, await launchService(options));
}
