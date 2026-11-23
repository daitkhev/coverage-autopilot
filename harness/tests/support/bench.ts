import { afterEach, beforeEach } from 'vitest';

import { HarnessError } from '#harness/shared/harness.error';
import { type FakeHost, fakeHost } from '#harness/tests/support/fake-host';
import {
  type TemporaryRepository,
  temporaryRepository,
} from '#harness/tests/support/temporary-repository';

/** A temporary repository and a host on it. Each test gets new ones. */
export interface Bench {
  readonly repository: TemporaryRepository;
  readonly host: FakeHost;
}

function inTest<Part>(part: Part | undefined): Part {
  if (part === undefined) {
    throw new HarnessError('The bench exists inside a test only.');
  }
  return part;
}

/** Sets the bench up before every test of the file and removes it after. */
export function useBench(): Bench {
  let repository: TemporaryRepository | undefined;
  let host: FakeHost | undefined;
  beforeEach(() => {
    repository = temporaryRepository();
    host = fakeHost({ root: repository.root });
  });
  afterEach(() => {
    repository?.dispose();
  });
  return {
    get repository() {
      return inTest(repository);
    },
    get host() {
      return inTest(host);
    },
  };
}
