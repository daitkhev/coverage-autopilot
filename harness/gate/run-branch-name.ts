import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host } from '#harness/gate/host';
import { HarnessError } from '#harness/shared/harness.error';

/** The branches that live long. They carry no type. */
const KEPT = ['dev', 'main'];

/** Dependabot names its branches itself, all under one folder. */
const ROBOT = /^dependabot\/[\w./@-]+$/;

/** Words in lower case and numbers, joined by single hyphens. */
const DESCRIPTION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether a branch is named `type/short-description`, or is a kept one. */
export function isBranchName(name: string, types: readonly string[]): boolean {
  if (KEPT.includes(name) || ROBOT.test(name)) {
    return true;
  }
  const [type, description, ...rest] = name.split('/');
  return (
    type !== undefined &&
    types.includes(type) &&
    description !== undefined &&
    DESCRIPTION.test(description) &&
    rest.length === 0
  );
}

/** Holds the name of the branch a pull request comes from. */
export function runBranchName(
  arguments_: readonly string[],
  host: Host,
  types: readonly string[],
): number {
  return exitCodeOf(host, () => {
    const [name, ...rest] = arguments_;
    if (name === undefined || rest.length > 0) {
      throw new HarnessError('usage: branch-name.ts <name of the branch>');
    }
    const named = isBranchName(name, types);
    host.print(
      named
        ? `branch-name: passed, ${name}`
        : `branch-name: "${name}" is not named type/short-description. ` +
            `The description is in lower case with hyphens. ` +
            `The types: ${types.join(', ')}.`,
    );
    return named ? 0 : 1;
  });
}
