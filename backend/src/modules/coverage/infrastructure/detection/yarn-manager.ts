import type { UnsupportedProject } from '#coverage/application/ports/project-detector.port';
import { readText } from '#coverage/infrastructure/detection/copy-text';
import type { ManagerChoice } from '#coverage/infrastructure/detection/manager-choice';
import {
  type Found,
  unsupported,
} from '#coverage/infrastructure/detection/runner-choice';
import { berryChoice } from '#coverage/infrastructure/detection/yarn-berry';
import {
  classicChoice,
  YARN_LOCKFILE,
} from '#coverage/infrastructure/detection/yarn-classic';

/** yarn 1 starts its lockfile so. yarn 2 and later write another format. */
const CLASSIC_HEADER = /^# yarn lockfile v1$/mu;

const CLASSIC = 'yarn 1';

const BERRY = 'yarn 2 or later';

/** The yarn that writes the format of a lockfile. */
type Format = typeof CLASSIC | typeof BERRY;

const MAJOR = /^yarn@(?<major>\d+)\./u;

const CLASSIC_MAJOR = '1';

/**
 * A yarn of another format than that of the lockfile would rewrite the
 * lockfile, or fail to read it.
 */
function formatRefusal(
  descriptor: string,
  format: Format,
): UnsupportedProject | null {
  const major = MAJOR.exec(descriptor)?.groups?.['major'];
  const writes = major === CLASSIC_MAJOR ? CLASSIC : BERRY;
  return major === undefined || writes === format
    ? null
    : unsupported(
        'unsupported_package_manager',
        `package.json names ${descriptor}, and ${YARN_LOCKFILE} has the ` +
          `format of ${format}.`,
      );
}

/** The yarn of the format of the lockfile, at the version package.json names. */
export function yarnChoice(
  root: string,
  descriptor: string | null,
): Found<ManagerChoice> | UnsupportedProject {
  const lockfile = readText(root, YARN_LOCKFILE) ?? '';
  const format = CLASSIC_HEADER.test(lockfile) ? CLASSIC : BERRY;
  const refusal =
    descriptor === null ? null : formatRefusal(descriptor, format);
  if (refusal !== null) {
    return refusal;
  }
  return format === CLASSIC
    ? classicChoice(lockfile, descriptor)
    : berryChoice(root, lockfile, descriptor);
}
