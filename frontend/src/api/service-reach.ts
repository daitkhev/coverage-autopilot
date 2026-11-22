import { CONTRACT_VERSION } from '@coverage-autopilot/api-contracts/health';

import { pollUntil } from '#api/polling';
import { linesSince, logSizeOf } from '#api/service-launch';
import {
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
    ? startService(options)
    : { outcome: 'did_not_start', lines: await linesSince(log, offset), log };
}

/**
 * Reaches the service of the instance, as a client does on every command.
 * A service of this contract is used as it is. Where nothing answers, a
 * service is started, once. An idle service of another contract is
 * replaced, and a busy one is left as it is. A health of another contract
 * may not match the schema of this client, so its version and its work
 * are read first, and the whole health only when the version is the same.
 */
export async function reachService(
  options: ServiceStartOptions,
): Promise<ServiceReach> {
  const { socket } = options.location;
  const reply = await lookForService(socket);
  if (reply === undefined) {
    return startService(options);
  }
  const found = versionOf(reply);
  if (found.contractVersion === CONTRACT_VERSION) {
    return readyService(socket, reply);
  }
  return isIdle(found) ? replaceService(options) : busyWith(found);
}
