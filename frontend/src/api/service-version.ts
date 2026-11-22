import {
  type ActiveWork,
  healthSchema,
} from '@coverage-autopilot/api-contracts/health';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';

import { jsonOf, type SocketReply } from '#api/service-answers';

/**
 * What the client reads of the health of a service of any version: its
 * contract, and whether it is idle and may be replaced.
 */
export interface ServiceVersion {
  readonly contractVersion: number;
  readonly activeWork: ActiveWork;
}

/**
 * The two fields every version of the health keeps. The rest of a health
 * of another contract may not match the schema of this client, so it is
 * let through here, and read only when the version is the same.
 */
const versionSchema = healthSchema
  .pick({ contractVersion: true, activeWork: true })
  .loose();

/** The version and the work of the health in the reply, and nothing else. */
export function versionOf(reply: SocketReply): ServiceVersion {
  const { contractVersion, activeWork } = parseAs(
    versionSchema,
    jsonOf(reply.text),
  );
  return { contractVersion, activeWork };
}

/** No scan and no improvement runs, so a stop loses no work. */
export function isIdle(version: ServiceVersion): boolean {
  return (
    version.activeWork.scans === 0 && version.activeWork.improvements === 0
  );
}
