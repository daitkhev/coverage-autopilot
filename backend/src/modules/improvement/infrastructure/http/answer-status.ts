import { type HttpStatus, Inject, Injectable } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/**
 * Sets the status of an answer a route gives back itself. A route that
 * answers one of two statuses sets the second here, through the adapter
 * of the platform, so no route knows which platform serves it.
 */
@Injectable()
export class AnswerStatus {
  private readonly adapterHost: HttpAdapterHost;

  public constructor(@Inject(HttpAdapterHost) adapterHost: HttpAdapterHost) {
    this.adapterHost = adapterHost;
  }

  /** `response` is the one a route takes with `@Res({ passthrough: true })`. */
  public set(response: unknown, status: HttpStatus): void {
    this.adapterHost.httpAdapter.status(response, status);
  }
}
