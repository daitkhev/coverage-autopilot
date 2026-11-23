import { describe, expect, it } from 'vitest';

import { checkTypes } from '#harness/gate/run-types';
import type { TypeProject } from '#harness/gate/type-projects';
import { fakeHost } from '#harness/tests/support/fake-host';

const ROOT: TypeProject = {
  name: 'root',
  config: 'tsconfig.json',
  hasSource: true,
};
const BACKEND: TypeProject = {
  name: 'backend',
  config: 'backend/tsconfig.json',
  hasSource: true,
};
const EMPTY: TypeProject = {
  name: 'frontend',
  config: 'frontend/tsconfig.json',
  hasSource: false,
};

describe('checkTypes', () => {
  it('should run the compiler on each project that has source', () => {
    const host = fakeHost();

    expect(checkTypes([ROOT, BACKEND, EMPTY], host)).toBe(0);
    expect(host.started.map((command) => command.arguments)).toEqual([
      ['--noEmit', '--project', 'tsconfig.json'],
      ['--noEmit', '--project', 'backend/tsconfig.json'],
    ]);
    expect(host.started[0]?.script).toBe('node_modules/typescript/bin/tsc');
  });

  it('should name a project with no source and not fail on it', () => {
    const host = fakeHost();

    expect(checkTypes([EMPTY], host)).toBe(0);
    expect(host.started).toEqual([]);
    expect(host.printed).toEqual(['types: frontend has no source yet']);
  });

  it('should fail when one project fails, and still run the others', () => {
    const host = fakeHost({
      passes: (command) => !command.arguments.includes('tsconfig.json'),
    });

    expect(checkTypes([ROOT, BACKEND], host)).toBe(1);
    expect(host.printed).toEqual([
      'types: root failed',
      'types: backend passed',
    ]);
  });
});
