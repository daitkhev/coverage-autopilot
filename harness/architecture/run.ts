import { compareFindings, type Finding } from '#harness/architecture/finding';
import { loadProject } from '#harness/architecture/load-project';
import { readPolicy } from '#harness/architecture/policy';
import { rulesOf } from '#harness/architecture/rules';

/**
 * Judges the tree under `root` by the policy of this harness. The tree and
 * the policy are separate on purpose: the policy never comes from the tree.
 */
export function runRatchet(root: string): Finding[] {
  const policy = readPolicy();
  const project = loadProject(root, policy.structure);
  return rulesOf(policy)
    .flatMap((rule) => rule.check(project))
    .sort(compareFindings);
}
