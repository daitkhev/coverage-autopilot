import { posix } from 'node:path';

import type { Structure } from '#harness/shared/structure';

/** One `tsconfig.json` the compiler is run on. */
export interface TypeProject {
  /** A name for the output: `root`, or the workspace. */
  readonly name: string;
  /** The configuration, from the root of the repository. */
  readonly config: string;
  /**
   * The compiler refuses a project with no file in it, so a workspace with
   * no source yet is named and is not run.
   */
  readonly hasSource: boolean;
}

function hasSourceIn(
  folder: string,
  files: readonly string[],
  structure: Structure,
): boolean {
  return files.some(
    (path) =>
      path.startsWith(`${folder}/`) &&
      structure.extensions.includes(posix.extname(path)),
  );
}

/** The root project and one project for each workspace, in a fixed order. */
export function typeProjects(
  files: readonly string[],
  structure: Structure,
): TypeProject[] {
  const workspaces = [...structure.workspaces.keys()].sort();
  return [
    { name: 'root', config: 'tsconfig.json', hasSource: true },
    ...workspaces.map((name) => ({
      name,
      config: `${name}/tsconfig.json`,
      hasSource: hasSourceIn(name, files, structure),
    })),
  ];
}
