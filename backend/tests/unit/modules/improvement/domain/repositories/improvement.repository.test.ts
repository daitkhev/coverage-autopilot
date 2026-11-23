import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  IMPROVEMENT_REPOSITORY,
  type ImprovementRepository,
} from '#improvement/domain/repositories/improvement.repository';
import type { Transaction } from '#kernel/transaction/transaction';

describe('ImprovementRepository', () => {
  it('should be injected by a token of its own', () => {
    expect(IMPROVEMENT_REPOSITORY.description).toBe('ImprovementRepository');
  });

  it('should write in the transaction of the caller', () => {
    expectTypeOf<ImprovementRepository['insert']>()
      .parameter(1)
      .toEqualTypeOf<Transaction>();
    expectTypeOf<ImprovementRepository['save']>()
      .parameter(1)
      .toEqualTypeOf<Transaction>();
  });

  it('should give back the saved improvement with its next version', () => {
    expectTypeOf<
      ImprovementRepository['save']
    >().returns.resolves.toEqualTypeOf<Improvement>();
  });

  it('should answer an improvement that is not there with null', () => {
    expectTypeOf<
      ImprovementRepository['findOpenByTarget']
    >().returns.resolves.toEqualTypeOf<Improvement | null>();
  });
});
