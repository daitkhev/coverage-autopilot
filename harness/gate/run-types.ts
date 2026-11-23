import { listFiles } from '#harness/architecture/files';
import type { Host } from '#harness/gate/host';
import { TOOLS } from '#harness/gate/tools';
import { type TypeProject, typeProjects } from '#harness/gate/type-projects';
import { readStructure } from '#harness/shared/structure';

function passes(project: TypeProject, host: Host): boolean {
  if (!project.hasSource) {
    host.print(`types: ${project.name} has no source yet`);
    return true;
  }
  const passed = host.start({
    nodeOptions: [],
    script: TOOLS.typescript,
    arguments: ['--noEmit', '--project', project.config],
  });
  host.print(`types: ${project.name} ${passed ? 'passed' : 'failed'}`);
  return passed;
}

/** Runs the compiler on every project and fails when one of them fails. */
export function checkTypes(
  projects: readonly TypeProject[],
  host: Host,
): number {
  const failed = projects.filter((project) => !passes(project, host));
  return failed.length === 0 ? 0 : 1;
}

export function runTypes(host: Host): number {
  const projects = typeProjects(listFiles(host.root), readStructure());
  return checkTypes(projects, host);
}
