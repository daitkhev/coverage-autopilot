import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Inject,
  type Provider,
} from '@nestjs/common';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';

import {
  apiErrorAnswerTo,
  faultFieldsOf,
} from '#infrastructure/http/api-error-answer';
import { LOGGER, type Logger } from '#ports/logger.port';

/**
 * Answers every request that did not succeed in the one shape of the
 * contract, whatever threw. A fault is logged with the route it happened
 * on, since the client is told nothing of its cause.
 */
@Catch()
class ApiErrorFilter implements ExceptionFilter {
  private readonly adapterHost: HttpAdapterHost;
  private readonly logger: Logger;

  public constructor(
    @Inject(HttpAdapterHost) adapterHost: HttpAdapterHost,
    @Inject(LOGGER) logger: Logger,
  ) {
    this.adapterHost = adapterHost;
    this.logger = logger;
  }

  public catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const http = host.switchToHttp();
    const answer = apiErrorAnswerTo(exception);
    if (answer.body.error === 'internal_error') {
      this.logger.error('A request ended in a fault.', {
        method: String(httpAdapter.getRequestMethod(http.getRequest())),
        path: String(httpAdapter.getRequestUrl(http.getRequest())),
        ...faultFieldsOf(exception),
      });
    }
    httpAdapter.reply(http.getResponse(), answer.body, answer.status);
  }
}

/**
 * The filter as the provider that puts it before every route. The root
 * module of the service lists it, and so does a test of a route.
 */
export const API_ERROR_FILTER: Provider = {
  provide: APP_FILTER,
  useClass: ApiErrorFilter,
};
