import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  REQUEST_HASHER,
  type RequestHasher,
} from '#improvement/application/ports/request-hasher.port';
import { Sha256RequestHasher } from '#improvement/infrastructure/hashing/sha256-request-hasher.adapter';

const hasher = new Sha256RequestHasher();

describe('Sha256RequestHasher', () => {
  describe('fingerprintOf', () => {
    it('should give the SHA-256 of the text in lower-case hex', () => {
      expect(hasher.fingerprintOf('abc').value).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('should hash the text as UTF-8', () => {
      expect(hasher.fingerprintOf('{"file":"src/prix-é.ts"}').value).toBe(
        'f9203a2708d01a06ecb84d88b03699177c2c2648fd1f0f41b12807cf75300d1b',
      );
    });

    it('should give the same fingerprint for the same text only', () => {
      const first = hasher.fingerprintOf('{"targetFile":"src/price.ts"}');

      expect(
        first.equals(hasher.fingerprintOf('{"targetFile":"src/price.ts"}')),
      ).toBe(true);
      expect(
        first.equals(hasher.fingerprintOf('{"targetFile":"src/tax.ts"}')),
      ).toBe(false);
    });
  });

  describe('when it is injected by its token', () => {
    it('should be the hasher of requests', async () => {
      const module = await Test.createTestingModule({
        providers: [{ provide: REQUEST_HASHER, useClass: Sha256RequestHasher }],
      }).compile();

      expect(module.get<RequestHasher>(REQUEST_HASHER)).toBeInstanceOf(
        Sha256RequestHasher,
      );
    });
  });
});
