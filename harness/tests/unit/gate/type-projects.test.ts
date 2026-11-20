import { describe, expect, it } from '@jest/globals';

import { typeProjects } from '#harness/gate/type-projects';
import { structureOf } from '#harness/tests/support/policy-builder';

describe('typeProjects', () => {
  it('should always run the root project', () => {
    expect(typeProjects([], structureOf())[0]).toEqual({
      name: 'root',
      config: 'tsconfig.json',
      hasSource: true,
    });
  });

  it('should name a workspace with no source and not run it', () => {
    const files = ['backend/package.json', 'backend/tsconfig.json'];

    expect(typeProjects(files, structureOf())).toContainEqual({
      name: 'backend',
      config: 'backend/tsconfig.json',
      hasSource: false,
    });
  });

  it('should run a workspace from its first source file', () => {
    const files = ['backend/package.json', 'frontend/tests/unit/a.test.tsx'];
    const projects = typeProjects(files, structureOf());

    expect(
      projects.map((project) => [project.name, project.hasSource]),
    ).toEqual([
      ['root', true],
      ['backend', false],
      ['frontend', true],
    ]);
  });

  it('should not take a folder with a longer name for the workspace', () => {
    const projects = typeProjects(['backend-tools/run.ts'], structureOf());

    expect(projects.every((p) => p.name === 'root' || !p.hasSource)).toBe(true);
  });
});
