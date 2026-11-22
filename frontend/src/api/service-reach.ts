import { CONTRACT_VERSION } from '@coverage-autopilot/api-contracts/health';

import { pollUntil } from '#api/polling';
import type { SocketReply } from '#api/service-answers';
import { linesSince, logSizeOf } from '#api/service-launch';
import {
  type AnswerAfterStart,
  healthReply,
  lookForService,
  type ReadyService,
  readyService,
  type ServiceDidNotStart,
  type ServiceStartOptions,
  startService,
} from '#api/service-start';
import { isIdle, type ServiceVersion, versionOf } from '#api/service-version';
import { socketServiceApi } from '#api/socket-service-api';

/**
 * A service of another contract runs work, so it is left alone. The work
 * it runs says how long the person may have to wait.
 */
interface BusyWithAnotherVersion extends ServiceVersion {
  readonly outcome: 'busy_with_another_version';
}

/** How a client ended up on its way to a service. */
export type ServiceReach =
  ReadyService | ServiceDidNotStart | BusyWithAnotherVersion;

/**
 * A reach replaces one service of another contract at most. One that
 * answers after the replacement was started by another client of that
 * contract in the same moment, which would replace this one in turn.
 */
type Replacement = 'may_replace' | 'replaced_one';

function busyWith(version: ServiceVersion): BusyWithAnotherVersion {
  return { outcome: 'busy_with_another_version', ...version };
}

/**
 * Asks the idle service of another contract to stop, waits until nothing
 * answers on its socket, and starts this one. A stop it refused means
 * work started since its health was read, so the health is read again to
 * say which.
 */
async function replaceService(
  options: ServiceStartOptions,
): Promise<ServiceReach> {
  const { socket, log } = options.location;
  options.observe('stopping_the_old_one');
  const offset = logSizeOf(log);
  const stop = await socketServiceApi(socket).stopService();
  if (stop.outcome === 'refused') {
    return busyWith(versionOf(await healthReply(socket)));
  }
  const gone = await pollUntil(
    options,
    async () => (await lookForService(socket)) === undefined,
  );
  return gone
    ? afterStart(options, await startService(options), 'replaced_one')
    : { outcome: 'did_not_start', lines: await linesSince(log, offset), log };
}

/**
 * Holds the health a service answered to the contract of this client. A
 * service of this contract is used as it is. An idle service of another
 * contract is replaced, and a busy one is left as it is, as is an idle
 * one once the reach replaced one. A health of another contract may not
 * match the schema of this client, so its version and its work are read
 * first, and the whole health only when the version is the same.
 */
async function heldToContract(
  options: ServiceStartOptions,
  reply: SocketReply,
  replacement: Replacement,
): Promise<ServiceReach> {
  const found = versionOf(reply);
  if (found.contractVersion === CONTRACT_VERSION) {
    return readyService(options.location.socket, reply);
  }
  return isIdle(found) && replacement === 'may_replace'
    ? replaceService(options)
    : busyWith(found);
}

/**
 * What answers after a start is held to the contract as what was found
 * before it: another client may have started a service of its own
 * contract in the same moment, and this start then gave way to it.
 */
async function afterStart(
  options: ServiceStartOptions,
  started: AnswerAfterStart | ServiceDidNotStart,
  replacement: Replacement,
): Promise<ServiceReach> {
  return started.outcome === 'answered'
    ? heldToContract(options, started.reply, replacement)
    : started;
}

/**
 * Reaches the service of the instance, as a client does on every command.
 * Where nothing answers, a service is started, once, and what answers
 * then is held to the contract as a service that was there.
 */
export async function reachService(
  options: ServiceStartOptions,
): Promise<ServiceReach> {
  const reply = await lookForService(options.location.socket);
  return reply === undefined
    ? afterStart(options, await startService(options), 'may_replace')
    : heldToContract(options, reply, 'may_replace');
}
