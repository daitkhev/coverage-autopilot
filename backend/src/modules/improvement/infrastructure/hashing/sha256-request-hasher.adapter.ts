import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { RequestHasher } from '#improvement/application/ports/request-hasher.port';
import { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';

/** The fingerprint of a request as the SHA-256 of its canonical text. */
@Injectable()
export class Sha256RequestHasher implements RequestHasher {
  public fingerprintOf(canonicalText: string): RequestFingerprint {
    return RequestFingerprint.create(
      createHash('sha256').update(canonicalText, 'utf8').digest('hex'),
    );
  }
}
