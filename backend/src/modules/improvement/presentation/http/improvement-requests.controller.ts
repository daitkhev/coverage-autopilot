import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';

import {
  type Improvement,
  startImprovementRequestSchema,
} from '@coverage-autopilot/api-contracts/improvements';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import {
  REQUEST_KEY_HEADER,
  requestKeySchema,
} from '@coverage-autopilot/api-contracts/request-key';

import type { StartImprovementCommand } from '#improvement/application/commands/start-improvement/start-improvement.command';
import { StartImprovementHandler } from '#improvement/application/commands/start-improvement/start-improvement.handler';
import { AnswerStatus } from '#improvement/presentation/http/answer-status';
import { improvementAnswerOf } from '#improvement/presentation/http/improvement-answers';
import { startRefusalOf } from '#improvement/presentation/http/improvement-refusals';

/**
 * What the route reads of a request besides its body. The key is read
 * here rather than by a decorator of its own, because the route already
 * takes the request for its signal, and a route takes three parameters.
 */
interface KeyedRequest {
  /** Node gives the name of every header in lower case. */
  readonly headers: Readonly<Record<string, unknown>>;
  /** Aborted when the client goes away, which stops the read of the head. */
  readonly signal: AbortSignal;
}

const REQUEST_KEY_FIELD = REQUEST_KEY_HEADER.toLowerCase();

/** The command a request asks for, under the key of its header. */
function commandOf(
  body: unknown,
  request: KeyedRequest,
): StartImprovementCommand {
  return {
    ...parseAs(startImprovementRequestSchema, body),
    requestKey: parseAs(requestKeySchema, request.headers[REQUEST_KEY_FIELD]),
  };
}

/**
 * Requests an improvement of a file from a snapshot. A new improvement
 * answers 202, and the one a repeated request finds answers 200, whatever
 * its status.
 */
@Controller('improvements')
export class ImprovementRequestsController {
  private readonly starts: StartImprovementHandler;
  private readonly status: AnswerStatus;

  public constructor(
    @Inject(StartImprovementHandler) starts: StartImprovementHandler,
    @Inject(AnswerStatus) status: AnswerStatus,
  ) {
    this.starts = starts;
    this.status = status;
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  public async request(
    @Body() body: unknown,
    @Req() request: KeyedRequest,
    @Res({ passthrough: true }) response: unknown,
  ): Promise<Improvement> {
    const result = await this.starts.execute(
      commandOf(body, request),
      request.signal,
    );
    if (result.outcome === 'refused') {
      throw startRefusalOf(result);
    }
    if (result.outcome === 'existing') {
      this.status.set(response, HttpStatus.OK);
    }
    return improvementAnswerOf(result.improvement);
  }
}
