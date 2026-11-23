import { HttpException, HttpStatus } from '@nestjs/common';

import {
  type ErrorBody,
  errorSchema,
} from '@coverage-autopilot/api-contracts/errors';
import { ContractMismatchError } from '@coverage-autopilot/api-contracts/parsing';

import type { LogFields } from '#ports/logger.port';

/** What a request that did not succeed is answered with. */
export interface ApiErrorAnswer {
  readonly status: number;
  readonly body: ErrorBody;
}

/**
 * The words of a fault never reach the client: they may hold a path, a
 * command or a part of a request. The log keeps them.
 */
const FAULT: ApiErrorAnswer = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  body: {
    error: 'internal_error',
    message: 'The service failed on this request. Its log has the cause.',
  },
};

const NO_ROUTE: ApiErrorAnswer = {
  status: HttpStatus.NOT_FOUND,
  body: {
    error: 'not_found',
    message: 'No route of the service answers this method and path.',
  },
};

/**
 * The framework refuses a body before a route sees it, such as text that
 * is not JSON. Its own words repeat a part of that body, so they are not
 * passed on.
 */
const UNREADABLE: ApiErrorAnswer = {
  status: HttpStatus.BAD_REQUEST,
  body: {
    error: 'invalid_request',
    message: 'The service could not read the request.',
  },
};

function mismatch(error: ContractMismatchError): ApiErrorAnswer {
  return {
    status: HttpStatus.BAD_REQUEST,
    body: {
      error: 'invalid_request',
      message: `The request: ${error.message}`,
    },
  };
}

/**
 * A route refuses with an exception of the framework that carries the
 * body of the contract, and that is passed on as it is. Any other one
 * comes from the framework itself and is answered by its status alone.
 */
function refusal(exception: HttpException): ApiErrorAnswer {
  const status = exception.getStatus();
  const written = errorSchema.safeParse(exception.getResponse());
  if (written.success) {
    return { status, body: written.data };
  }
  if (status >= FAULT.status) {
    return FAULT;
  }
  return status === NO_ROUTE.status ? NO_ROUTE : UNREADABLE;
}

/**
 * The one shape of an answer that is not a success: 400 for a request
 * that does not match its schema, the status a route chose for what it
 * refused, and 500 for everything else, which is a fault.
 */
export function apiErrorAnswerTo(exception: unknown): ApiErrorAnswer {
  if (exception instanceof ContractMismatchError) {
    return mismatch(exception);
  }
  return exception instanceof HttpException ? refusal(exception) : FAULT;
}

/**
 * What the log keeps of a fault, with the code of a typed error. The
 * answer carries none of it.
 */
export function faultFieldsOf(exception: unknown): LogFields {
  if (!(exception instanceof Error)) {
    return { error: 'not an error', detail: String(exception), code: null };
  }
  const code = 'code' in exception ? String(exception.code) : null;
  return { error: exception.name, detail: exception.message, code };
}
