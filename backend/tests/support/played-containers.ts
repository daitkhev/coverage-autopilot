import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * The containers the stand-in of the engine plays, as files in its
 * folder: one for each container that was not removed, with its labels.
 * A run drops its own once its command ended, as `--rm` makes an engine
 * do. A removal drops it, and the process that still plays it ends then.
 */

/** The labels of a container, as its file keeps them. */
type Labels = Readonly<Record<string, string>>;

const CONTAINERS = 'containers';
const SUFFIX = '.json';
const NAME_FLAG = '--name';
const LABEL_FLAG = '--label';

/** The last flag of a `run` before the image and the command. */
const LAST_FLAG = '--env-file';

/** How a listing names the label it filters by. */
const LABEL_FILTER = 'label=';

function fileOf(folder: string, name: string): string {
  return join(folder, CONTAINERS, `${name}${SUFFIX}`);
}

/** The values each `flag` among `args` is followed by. */
function valuesAfter(args: readonly string[], flag: string): string[] {
  return args.flatMap((arg, index) =>
    arg === flag ? [args[index + 1] ?? ''] : [],
  );
}

/** `key=value` as a pair. */
function pairOf(text: string): [string, string] {
  const equals = text.indexOf('=');
  return [text.slice(0, equals), text.slice(equals + 1)];
}

/** The containers that were not removed, by their names. */
export function playedContainers(folder: string): string[] {
  const containers = join(folder, CONTAINERS);
  return existsSync(containers)
    ? readdirSync(containers).map((file) => file.slice(0, -SUFFIX.length))
    : [];
}

/** Keeps the container of a `run`, with its labels, and gives its name. */
export function holdContainer(folder: string, args: readonly string[]): string {
  const flags = args.slice(0, args.indexOf(LAST_FLAG));
  const name = valuesAfter(flags, NAME_FLAG)[0] ?? '';
  const labels = Object.fromEntries(valuesAfter(flags, LABEL_FLAG).map(pairOf));
  mkdirSync(join(folder, CONTAINERS), { recursive: true });
  writeFileSync(fileOf(folder, name), JSON.stringify(labels));
  return name;
}

/** Whether the container was not removed yet. */
export function holdsContainer(folder: string, name: string): boolean {
  return existsSync(fileOf(folder, name));
}

/** The container is gone, whether it was there or not, as `rm --force`. */
export function dropContainer(folder: string, name: string): void {
  rmSync(fileOf(folder, name), { force: true });
}

/** The labels of a container, or `null` once it is gone. */
function labelsOf(folder: string, name: string): Labels | null {
  try {
    return JSON.parse(readFileSync(fileOf(folder, name), 'utf8')) as Labels;
  } catch {
    return null;
  }
}

/** The names a `ps` with these arguments prints: every filter holds. */
export function listedContainers(
  folder: string,
  args: readonly string[],
): string[] {
  const filters = args
    .filter((arg) => arg.startsWith(LABEL_FILTER))
    .map((arg) => pairOf(arg.slice(LABEL_FILTER.length)));
  return playedContainers(folder).filter((name) => {
    const labels = labelsOf(folder, name);
    return (
      labels !== null && filters.every(([key, value]) => labels[key] === value)
    );
  });
}
