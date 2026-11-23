import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ImprovementStatus } from '@coverage-autopilot/api-contracts/statuses';

import { COVERAGE_PUBLIC_API } from '#coverage/application/contracts/coverage-public-api';
import {
  FILE_IMPROVEMENTS,
  type FileImprovementDto,
  type FileImprovements,
  type ImprovementRefDto,
} from '#coverage/application/contracts/file-improvements';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';

describe('FileImprovements', () => {
  it('should be injected by a token of its own', () => {
    expect(FILE_IMPROVEMENTS.description).toBe('FileImprovements');
    expect(FILE_IMPROVEMENTS).not.toBe(COVERAGE_PUBLIC_API);
  });

  it('should be asked by the id of a repository alone', () => {
    expectTypeOf<FileImprovements['latestOf']>().parameters.toEqualTypeOf<
      [RepositoryId]
    >();
    expectTypeOf<FileImprovements['latestOf']>().returns.resolves.toEqualTypeOf<
      FileImprovementDto[]
    >();
  });

  it('should name a file by its path, so its files are joined by it', () => {
    expectTypeOf<FileImprovementDto['path']>().toEqualTypeOf<FilePath>();
  });

  it('should name every status a person can be shown', () => {
    expectTypeOf<
      ImprovementRefDto['status']
    >().toEqualTypeOf<ImprovementStatus>();
  });
});
