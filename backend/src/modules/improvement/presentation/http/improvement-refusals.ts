import {
  BadRequestException,
  ConflictException,
  type HttpException,
  NotFoundException,
} from '@nestjs/common';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';

import type { StartRefusal } from '#improvement/application/commands/start-improvement/start-improvement.command';

/** No improvement has the id of the path, or it is no id of one at all. */
export function improvementNotFound(): NotFoundException {
  return new NotFoundException({
    error: 'not_found',
    message: 'No improvement has this id.',
  } satisfies ErrorBody);
}

/** The gate has accepted no patch of the improvement yet, or never will. */
export function noAcceptedPatch(improvementId: string): ConflictException {
  return new ConflictException({
    error: 'status_conflict',
    message: `The improvement ${improvementId} has no accepted patch.`,
    improvementId,
  } satisfies ErrorBody);
}

/**
 * A request for an improvement the service would not take: 400 for a
 * value that breaks a rule, 404 for a snapshot or a measured file that is
 * not there, and 409 for a conflict, which names the earlier improvement
 * when there is one, so the client can open it.
 */
export function startRefusalOf(refusal: StartRefusal): HttpException {
  const { message } = refusal;
  switch (refusal.reason) {
    case 'invalid_request':
      return new BadRequestException({
        error: 'invalid_request',
        message,
      } satisfies ErrorBody);
    case 'snapshot_not_found':
    case 'target_not_measured':
      return new NotFoundException({
        error: 'not_found',
        message,
      } satisfies ErrorBody);
    case 'stale_snapshot':
      return new ConflictException({
        error: 'stale_snapshot',
        message,
      } satisfies ErrorBody);
    default:
      return new ConflictException({
        error: refusal.reason,
        message,
        improvementId: refusal.improvementId,
      } satisfies ErrorBody);
  }
}
