import { z } from 'zod';

/** A SHA-1 or a SHA-256 object name, as git prints it. */
const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/** The line of `ls-remote --symref` that names the branch of `HEAD`. */
const SYMBOLIC_HEAD = /^ref: refs\/heads\/(?<branch>[^\t\n]+)\tHEAD$/mu;

const LINE_BREAK = '\n';
const FIELD_BREAK = '\t';
const NUL = '\0';

/** Where the path starts in a line of `git apply --numstat -z`. */
const NUMSTAT_PATH = 2;

/**
 * `git ls-remote --symref <url> HEAD`: the branch `HEAD` names, or `null`
 * when the repository is empty and names none.
 */
export const symbolicHeadSchema = z
  .string()
  .transform((text) => SYMBOLIC_HEAD.exec(text)?.groups?.['branch'] ?? null);

/**
 * `git ls-remote <url> <ref>`: the commit of exactly that ref, or `null`
 * when the repository does not have it. A pattern of `ls-remote` also
 * matches longer refs that end the same way, so those lines are skipped.
 */
export function remoteRefSchema(ref: string): z.ZodType<string | null, string> {
  return z
    .string()
    .transform((text) => {
      const line = text
        .split(LINE_BREAK)
        .find((candidate) => candidate.endsWith(`${FIELD_BREAK}${ref}`));
      return line?.split(FIELD_BREAK)[0] ?? null;
    })
    .pipe(z.string().regex(OBJECT_NAME).nullable());
}

/** `git rev-parse <revision>`: one object name on a line. */
export const revisionSchema = z
  .string()
  .transform((text) => text.trim())
  .pipe(z.string().regex(OBJECT_NAME));

/** Paths ended by NUL, as `git diff --name-only -z` prints them. */
export const pathListSchema = z
  .string()
  .transform((text) => text.split(NUL).filter((path) => path !== ''));

/**
 * `git apply --numstat -z`: `added<TAB>deleted<TAB>path` and a NUL for
 * each file. A path is printed as it is, so it may hold a tab itself.
 */
export const numstatSchema = pathListSchema.transform((lines) =>
  lines.map((line) =>
    line.split(FIELD_BREAK).slice(NUMSTAT_PATH).join(FIELD_BREAK),
  ),
);
