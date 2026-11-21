import {
  headerNamesOf,
  targetNameOf,
} from '#verification/domain/services/git-name.service';

const HEADER = 'diff --git ';
const PLAIN_NEW_FILE = 'new file mode 100644';
const NEW_FILE = 'new file mode ';
const FROM_NOWHERE = '--- /dev/null';
const NO_NEWLINE = '\\ No newline at end of file';
const ADDED_LINE = '+';

/** A line git writes between the header of a file and its text. */
const EXTENDED_LINE =
  /^(?:old mode|new mode|deleted file mode|new file mode|copy from|copy to|rename from|rename to|similarity index|dissimilarity index|index) /u;
const INDEX_LINE = /^index [0-9a-f]+\.\.[0-9a-f]+$/u;
const BINARY_LINE = /^(?:GIT binary patch|Binary files )/u;

/** The one hunk git writes for a new file: from no line to the first. */
const NEW_FILE_HUNK = /^@@ -0,0 \+1(?:,(\d+))? @@/u;

/** The lines before the first added line: `---`, `+++` and the hunk. */
const NEW_FILE_TEXT_START = 3;

/** An extended line that alone refuses the file, and the sentence for it. */
const REFUSED_LINES: readonly {
  readonly line: RegExp;
  readonly sentence: (path: string) => string;
}[] = [
  {
    line: /^deleted file mode /u,
    sentence: (path) => `The patch deletes ${path}.`,
  },
  {
    line: /^(?:copy (?:from|to)|rename (?:from|to)|(?:dis)?similarity index) /u,
    sentence: (path) => `The patch renames or copies ${path}.`,
  },
  {
    line: /^(?:old|new) mode /u,
    sentence: (path) => `The patch changes the mode of ${path}.`,
  },
  {
    line: /^new file mode 120000$/u,
    sentence: (path) => `The patch adds ${path} as a symbolic link.`,
  },
  {
    line: /^new file mode 100755$/u,
    sentence: (path) => `The patch adds ${path} as an executable file.`,
  },
];

/** The paths of the new plain files of a patch, as written in it. */
export type AddedFiles =
  | { readonly outcome: 'read'; readonly paths: readonly string[] }
  | { readonly outcome: 'refused'; readonly reason: string };

type Reading =
  | { readonly next: number; readonly path: string }
  | { readonly reason: string };

interface Place {
  readonly lines: readonly string[];
  /** The index of the first line of the place. */
  readonly at: number;
  readonly path: string;
}

function linesOf(text: string): string[] {
  const lines = text.split('\n');
  return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

function extendedLinesAt(lines: readonly string[], start: number): string[] {
  const end = lines.findIndex(
    (line, at) => at >= start && !EXTENDED_LINE.test(line),
  );
  return lines.slice(start, end === -1 ? lines.length : end);
}

/** Exactly one plain new file mode and at most one index line pass. */
function extendedProblemOf(
  extended: readonly string[],
  path: string,
): string | null {
  const refused = REFUSED_LINES.find(({ line }) =>
    extended.some((each) => line.test(each)),
  );
  if (refused !== undefined) {
    return refused.sentence(path);
  }
  if (!extended.some((line) => line.startsWith(NEW_FILE))) {
    return `The patch changes ${path}, a file the commit has.`;
  }
  const plain = extended.filter((line) => line === PLAIN_NEW_FILE).length;
  const index = extended.filter((line) => INDEX_LINE.test(line)).length;
  if (plain === 0) {
    return `The patch adds ${path}, which is not a plain file.`;
  }
  return plain === 1 && index <= 1 && plain + index === extended.length
    ? null
    : `The patch describes ${path} in a way git does not write.`;
}

function hunkLengthOf(line: string | undefined): number {
  const hunk = NEW_FILE_HUNK.exec(line ?? '');
  return hunk === null ? 0 : Number(hunk[1] ?? '1');
}

/**
 * The text of a new file: one hunk of added lines and nothing else. Its
 * length is counted, so an added line that looks like a header is text.
 */
function textAt(place: Place): Reading {
  const { lines, at, path } = place;
  const start = at + NEW_FILE_TEXT_START;
  const [from, target, hunk] = lines.slice(at, start);
  const named = from === FROM_NOWHERE && targetNameOf(target ?? '') === path;
  const length = hunkLengthOf(hunk);
  const added = lines.slice(start, start + length);
  const whole =
    named &&
    length > 0 &&
    added.length === length &&
    added.every((line) => line.startsWith(ADDED_LINE));
  if (!whole) {
    return {
      reason: `The patch holds a line in ${path} that does not add text.`,
    };
  }
  const end = start + length;
  return { path, next: lines[end] === NO_NEWLINE ? end + 1 : end };
}

function bodyAt(place: Place): Reading {
  const first = place.lines[place.at];
  if (first === undefined || first.startsWith(HEADER)) {
    return { path: place.path, next: place.at };
  }
  return BINARY_LINE.test(first)
    ? { reason: `The patch adds ${place.path} as a binary file.` }
    : textAt(place);
}

function sectionAt(
  lines: readonly string[],
  at: number,
  header: string,
): Reading {
  const names = header.startsWith(HEADER)
    ? headerNamesOf(header.slice(HEADER.length))
    : null;
  if (names === null) {
    return {
      reason: `Line ${String(at + 1)} of the patch is not the header of a file as git writes one.`,
    };
  }
  if (names.old !== names.new) {
    return {
      reason: `The patch renames or copies ${names.old} to ${names.new}.`,
    };
  }
  const extended = extendedLinesAt(lines, at + 1);
  const problem = extendedProblemOf(extended, names.new);
  return problem === null
    ? bodyAt({ lines, at: at + 1 + extended.length, path: names.new })
    : { reason: problem };
}

/**
 * Reads a patch as `git diff` writes it and keeps only new plain files of
 * text. Every line must belong to one of them: `git apply` also takes a
 * section with no `diff --git` header, so a line outside any file could
 * change a file of the commit.
 */
export function addedFilesOf(text: string): AddedFiles {
  const lines = linesOf(text);
  const paths: string[] = [];
  let at = 0;
  let header = lines[at];
  while (header !== undefined) {
    const reading = sectionAt(lines, at, header);
    if ('reason' in reading) {
      return { outcome: 'refused', reason: reading.reason };
    }
    paths.push(reading.path);
    at = reading.next;
    header = lines[at];
  }
  return paths.length === 0
    ? { outcome: 'refused', reason: 'The patch adds no file.' }
    : { outcome: 'read', paths };
}
