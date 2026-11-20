import { compareFindings, type Finding } from '#harness/architecture/finding';
import { loadProject } from '#harness/architecture/load-project';
import { rulesOf } from '#harness/architecture/rules';
import { readStructure } from '#harness/shared/policy';

/**
 * Judges the tree under `root` by the policy of this harness. The tree and
 * the policy are separate on purpose: the policy never comes from the tree.
 */
export function runRatchet(root: string): Finding[] {
  const structure = readStructure();
  const project = loadProject(root, structure);
  return rulesOf(structure)
    .flatMap((rule) => rule.check(project))
    .sort(compareFindings);
}
