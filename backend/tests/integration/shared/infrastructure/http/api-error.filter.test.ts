import {
  Body,
  ConflictException,
  Controller,
  Get,
  PayloadTooLargeException,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type ErrorBody,
  errorSchema,
} from '@coverage-autopilot/api-contracts/errors';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';
import { resourceParamsSchema } from '@coverage-autopilot/api-contracts/values';

import { InvalidStoredDocumentError } from '#coverage/infrastructure/errors/invalid-stored-document.error';
import {
  type HttpService,
  startHttpService,
} from '#tests/support/http-service';

const IN_PROGRESS: ErrorBody = {
  error: 'improvement_in_progress',
  message: 'Another improvement of the file is in progress.',
  improvementId: 'improvement-1',
};

const SECRET = 'a-token-nobody-may-read';

@Controller('words')
class WordsController {
  @Post()
  public say(@Body() body: unknown): { readonly said: string } {
    return { said: parseAs(resourceParamsSchema, body).id };
  }

  @Get('conflict')
  public conflict(): never {
    throw new ConflictException(IN_PROGRESS);
  }

  @Get('too-large')
  public tooLarge(): never {
    throw new PayloadTooLargeException(`It holds ${SECRET}.`);
  }

  @Get('unavailable')
  public unavailable(): never {
    throw new ServiceUnavailableException(`It holds ${SECRET}.`);
  }

  @Get('fault')
  public fault(): never {
    throw new InvalidStoredDocumentError(`The document holds ${SECRET}.`);
  }
}

describe('ApiErrorFilter', () => {
  let service: HttpService;

  beforeEach(async () => {
    service = await startHttpService({ controllers: [WordsController] });
  });

  afterEach(async () => {
    await service.close();
  });

  it('should leave an answer of a route as it is', async () => {
    const answer = await service.send('POST', '/words', {
      body: { id: 'covered' },
    });

    expect(answer).toEqual({ status: 201, body: { said: 'covered' } });
  });

  describe('when a request does not match its schema', () => {
    it('should answer 400 with the place and the rule', async () => {
      const answer = await service.send('POST', '/words', {
        body: { id: '', more: SECRET },
      });

      expect(answer).toEqual({
        status: 400,
        body: {
          error: 'invalid_request',
          message:
            'The request: It does not match its schema. ' +
            'id: too_small, the value: unrecognized_keys.',
        },
      });
    });
  });

  describe('when a route refuses with the body of the contract', () => {
    it('should pass the status and the body on', async () => {
      const answer = await service.send('GET', '/words/conflict');

      expect(answer).toEqual({ status: 409, body: IN_PROGRESS });
    });
  });

  describe('when the framework refuses before a route', () => {
    it('should answer 404 for a path no route has', async () => {
      const answer = await service.send('GET', '/nowhere');

      expect(answer.status).toBe(404);
      expect(errorSchema.parse(answer.body).error).toBe('not_found');
    });

    it('should answer 400 for a body that is not JSON, without its text', async () => {
      const answer = await service.send('POST', '/words', {
        text: `{"id": ${SECRET}`,
      });

      expect(answer.status).toBe(400);
      expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
      expect(JSON.stringify(answer.body)).not.toContain(SECRET);
    });

    it('should answer 400 for any other refusal of a request', async () => {
      const answer = await service.send('GET', '/words/too-large');

      expect(answer.status).toBe(400);
      expect(JSON.stringify(answer.body)).not.toContain(SECRET);
    });
  });

  describe('when a route ends in a fault', () => {
    it('should answer 500 with nothing of the cause', async () => {
      const answer = await service.send('GET', '/words/fault');

      expect(answer).toEqual({
        status: 500,
        body: {
          error: 'internal_error',
          message: 'The service failed on this request. Its log has the cause.',
        },
      });
    });

    it('should log the route, the error and its code', async () => {
      await service.send('GET', '/words/fault');

      expect(service.logger.at('error')).toEqual([
        {
          level: 'error',
          message: 'A request ended in a fault.',
          fields: {
            method: 'GET',
            path: '/words/fault',
            error: 'InvalidStoredDocumentError',
            detail: `The document holds ${SECRET}.`,
            code: 'invalid_stored_document',
          },
        },
      ]);
    });

    it('should answer 500 for a failure the framework names', async () => {
      const answer = await service.send('GET', '/words/unavailable');

      expect(answer.status).toBe(500);
      expect(JSON.stringify(answer.body)).not.toContain(SECRET);
    });
  });

  it('should log nothing for a request it refuses', async () => {
    await service.send('GET', '/words/conflict');
    await service.send('GET', '/nowhere');

    expect(service.logger.lines).toEqual([]);
  });
});
