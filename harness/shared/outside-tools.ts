import { HarnessError } from '#harness/shared/harness.error';
import { readJsonRecord, recordAt, stringAt } from '#harness/shared/json';
import { policyFile } from '#harness/shared/policy';

/**
 * A tool that is a program and not a package: one version of it, as the
 * archive its maker publishes for one kind of machine.
 */
export interface OutsideTool {
  readonly name: string;
  readonly version: string;
  /** The file of the archive that is the program. */
  readonly program: string;
  readonly url: string;
  /** The checksum the archive must have. Nothing else is unpacked. */
  readonly sha256: string;
}

/** Reads a tool of `tools.json` for a machine, such as `linux-x64`. */
export function readOutsideTool(name: string, machine: string): OutsideTool {
  const tools = recordAt(readJsonRecord(policyFile('tools.json')), 'tools');
  if (!Object.hasOwn(tools, name)) {
    throw new HarnessError(`tools.json has no tool named "${name}".`);
  }
  const tool = recordAt(tools, name);
  const archives = recordAt(tool, 'archives');
  if (!Object.hasOwn(archives, machine)) {
    throw new HarnessError(`tools.json has no ${name} for ${machine}.`);
  }
  const archive = recordAt(archives, machine);
  return {
    name,
    version: stringAt(tool, 'version'),
    program: stringAt(tool, 'program'),
    url: stringAt(archive, 'url'),
    sha256: stringAt(archive, 'sha256'),
  };
}
