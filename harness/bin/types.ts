import { spawnSync } from 'node:child_process';

import { listFiles } from '#harness/architecture/files';
import { type TypeProject, typeProjects } from '#harness/gate/type-projects';
import { REPOSITORY_ROOT } from '#harness/shared/policy';
import { readStructure } from '#harness/shared/structure';

const COMPILER = 'node_modules/typescript/bin/tsc';

function passes(project: TypeProject): boolean {
  if (!project.hasSource) {
    process.stdout.write(`types: ${project.name} has no source yet\n`);
    return true;
  }
  const result = spawnSync(
    process.execPath,
    [COMPILER, '--noEmit', '--project', project.config],
    { cwd: REPOSITORY_ROOT, stdio: 'inherit' },
  );
  const verdict = result.status === 0 ? 'passed' : 'failed';
  process.stdout.write(`types: ${project.name} ${verdict}\n`);
  return result.status === 0;
}

const projects = typeProjects(listFiles(REPOSITORY_ROOT), readStructure());
const failed = projects.filter((project) => !passes(project));

process.exitCode = failed.length === 0 ? 0 : 1;
