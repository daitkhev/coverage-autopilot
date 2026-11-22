import type { ServiceConfig } from '#infrastructure/config/service-config';
import { faultFieldsOf } from '#infrastructure/logging/fault-fields';
import { removeLeftoverContainers } from '#infrastructure/sandbox/leftover-containers';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';
import type { Logger } from '#ports/logger.port';
import { RepositoriesModule } from '#repositories/repositories.module';

/** How many containers are gone. A part that failed removed none. */
async function sweptContainers(
  settings: SandboxSettings,
  log: Logger,
): Promise<number> {
  try {
    const sweep = await removeLeftoverContainers(settings);
    for (const { name, detail } of sweep.left) {
      log.warn('A container a stopped service left could not be removed.', {
        container: name,
        detail,
      });
    }
    return sweep.removed.length;
  } catch (error) {
    log.warn(
      'The containers a stopped service left could not be listed, so none ' +
        'was removed.',
      faultFieldsOf(error),
    );
    return 0;
  }
}

/** How many working copies are gone. A part that failed removed none. */
async function sweptCopies(root: string, log: Logger): Promise<number> {
  try {
    const sweep = await RepositoriesModule.removeLeftoverCopies(root);
    for (const refusal of sweep.left) {
      log.warn(
        'A working copy a stopped service left could not be removed.',
        faultFieldsOf(refusal),
      );
    }
    return sweep.removed;
  } catch (error) {
    log.warn(
      'The working copies a stopped service left could not be read, so ' +
        'none was removed.',
      faultFieldsOf(error),
    );
    return 0;
  }
}

/**
 * Removes what a service of the instance left when it stopped without
 * its clean stop: the containers first, since one that runs writes into
 * a copy, then every working copy, and never a mirror. It runs under the
 * lock of the instance and before the worker claims a job, so no other
 * service of the instance runs and no job holds a copy: a job taken back
 * after a crash makes its copy anew. A part that fails is told in the log
 * and the start goes on.
 */
export async function sweepLeftovers(
  config: ServiceConfig,
  logger: Logger,
): Promise<void> {
  const log = logger.child({ component: 'start-sweep' });
  const containers = await sweptContainers(config.sandbox, log);
  const workingCopies = await sweptCopies(config.instance.workingCopies, log);
  if (containers + workingCopies > 0) {
    log.info('The start removed what a stopped service left.', {
      containers,
      workingCopies,
    });
  }
}
