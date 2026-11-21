import { realpathSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';

/** Text a tool wrote, made fit to be kept or shown. */
export type Scrub = (text: string) => string;

/** What stands for the root of the working copy in text that is kept. */
const ROOT = '.';

const LINE_BREAK = /\r?\n/u;

/** A sentence for a person, not a log: the first lines say enough. */
const DETAIL_CHARACTERS = 300;

/**
 * The working copy as the service named it and as the file system
 * resolves it, the longer first: on macOS `/var/x` is `/private/var/x`,
 * and replacing the shorter first would leave `/private` behind.
 */
function rootsOf(workingCopyPath: string): string[] {
  const roots = new Set([realpathSync(workingCopyPath), workingCopyPath]);
  return [...roots].sort((first, second) => second.length - first.length);
}

/**
 * Takes the codes of a terminal and the path of the working copy out of
 * what a tool wrote. The sandbox mounts the copy at its path on the host,
 * so that path is the one path of the host a tool can print.
 */
export function scrubberOf(workingCopyPath: string): Scrub {
  const roots = rootsOf(workingCopyPath);
  return (text) =>
    roots.reduce(
      (kept, root) => kept.replaceAll(root, ROOT),
      stripVTControlCharacters(text),
    );
}

/** At most the given number of characters, with a mark where it was cut. */
export function capped(text: string, characters: number): string {
  return text.length <= characters ? text : `${text.slice(0, characters)}…`;
}

/** The first line the marker finds, or else the last line with text. */
function tellingLineOf(output: string, marker: RegExp): string | undefined {
  const lines = output
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines.find((line) => marker.test(line)) ?? lines.at(-1);
}

/**
 * What happened, then the line of the output that tells why, such as the
 * first error a tool logged. The whole output is kept as an artifact.
 */
export function detailOf(
  summary: string,
  output: string,
  marker: RegExp,
): string {
  const line = tellingLineOf(output, marker);
  const detail = line === undefined ? summary : `${summary} ${line}`;
  return capped(detail, DETAIL_CHARACTERS);
}
