import { createHash } from 'node:crypto';

/**
 * The label of an image the service built: the SHA-256 of the file it was
 * built from, so an image of the right name built from another file is
 * told apart. Every instance on the machine shares an image, so it
 * carries no label of an instance.
 */
const FILE_LABEL = 'coverage-autopilot.build-file-sha256';

/** What an image is built from. */
interface BuildSource {
  readonly file: string;
  /** The SHA-256 of the file, which the image is labelled with. */
  readonly digest: string;
  /** The folder the engine is given beside the file. */
  readonly context: string;
}

/** The SHA-256 of the content of a file, as the label of an image says it. */
export function fileDigestOf(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Prints the label of the file of the image, or nothing when it has none.
 * The engine fails when it has no image of the name.
 */
export function inspectArguments(image: string): string[] {
  const format = `{{ index .Config.Labels "${FILE_LABEL}" }}`;
  return ['image', 'inspect', '--format', format, image];
}

/** Builds the image from its file, gives it its name and labels it. */
export function buildArguments(image: string, source: BuildSource): string[] {
  return [
    ...['build', '--tag', image],
    ...['--label', `${FILE_LABEL}=${source.digest}`],
    ...['--file', source.file, source.context],
  ];
}

/** Takes the image from its registry. */
export function pullArguments(image: string): string[] {
  return ['pull', image];
}
