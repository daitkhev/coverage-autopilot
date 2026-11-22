import { Controller, Get, Req } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type HttpService,
  startHttpService,
} from '#tests/support/http-service';

interface Seen {
  signal: AbortSignal | undefined;
  /** Lets the route that waits answer. */
  release: () => void;
}

const seen: Seen = { signal: undefined, release: () => undefined };

@Controller('work')
class WorkController {
  @Get('quick')
  public quick(@Req() request: { readonly signal: AbortSignal }): string[] {
    seen.signal = request.signal;
    return [];
  }

  @Get('slow')
  public async slow(
    @Req() request: { readonly signal: AbortSignal },
  ): Promise<string[]> {
    seen.signal = request.signal;
    await new Promise<void>((resolve) => {
      seen.release = resolve;
      request.signal.addEventListener('abort', () => {
        resolve();
      });
    });
    return [];
  }
}

/**
 * Node gives every request the signal of its connection, and the routes
 * hand it to the use cases that start a tool. This holds the platform to
 * what they rely on.
 */
describe('the signal of a request', () => {
  let service: HttpService;

  beforeEach(async () => {
    seen.signal = undefined;
    service = await startHttpService({ controllers: [WorkController] });
  });

  afterEach(async () => {
    seen.release();
    await service.close();
  });

  it('should leave the signal alone when the answer was written', async () => {
    const answer = await service.send('GET', '/work/quick');

    expect(answer.status).toBe(200);
    expect(seen.signal?.aborted).toBe(false);
  });

  describe('when the client goes away before the answer', () => {
    it('should abort the signal of the request', async () => {
      await service.abandon('GET', '/work/slow');

      await expect.poll(() => seen.signal?.aborted).toBe(true);
    });
  });
});
