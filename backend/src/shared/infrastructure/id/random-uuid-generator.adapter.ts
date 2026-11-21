import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { IdGenerator } from '#kernel/id/id-generator';

/** The only place that makes a real id. */
@Injectable()
export class RandomUuidGenerator implements IdGenerator {
  public generate(): string {
    return randomUUID();
  }
}
