/** One `key: value` line of a file of YAML, with the keys above it. */
export interface KeyLine {
  /** The keys from the top of the document down to this one, unquoted. */
  readonly path: readonly string[];
  /** What follows the colon, unquoted, or `null` when nothing does. */
  readonly value: string | null;
}

interface Level {
  readonly indent: number;
  readonly key: string;
}

/**
 * A key of a block mapping: quoted, or plain up to the colon a space or
 * the end of the line follows, then its value and a comment, if any. A
 * line of a list, a comment or the rest of a long text is no key.
 */
const KEY_LINE =
  /^(?<indent> *)(?<key>"[^"]*"|'[^']*'|[^\s#'"-][^#]*?):(?:\s+(?<value>"[^"]*"|'[^']*'|.*?))?(?:\s+#.*)?\s*$/u;

const DOCUMENT_START = '---';

const QUOTED = /^(?<quote>["'])(?<text>.*)\k<quote>$/u;

export function unquoted(text: string): string {
  return QUOTED.exec(text)?.groups?.['text'] ?? text;
}

function nested(levels: readonly Level[], level: Level): Level[] {
  return [...levels.filter(({ indent }) => indent < level.indent), level];
}

/** The key of a line and its value, or `null` for a line with no key. */
function keyOf(line: string): { level: Level; value: string | null } | null {
  const found = KEY_LINE.exec(line)?.groups;
  if (found === undefined) {
    return null;
  }
  const value = unquoted(found['value'] ?? '');
  return {
    level: {
      indent: found['indent']?.length ?? 0,
      key: unquoted(found['key'] ?? ''),
    },
    value: value === '' ? null : value,
  };
}

/**
 * The keys of a file of YAML that a tool wrote, each with its path, in
 * the order of the file. It reads the block mappings a lockfile and a
 * file of settings are made of, and no more of YAML than that: a flow
 * mapping is the text of a value, and a new document starts at the top.
 */
export function keyLinesOf(text: string): KeyLine[] {
  const lines: KeyLine[] = [];
  let levels: Level[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const key = keyOf(line);
    levels = line === DOCUMENT_START ? [] : levels;
    if (key !== null) {
      levels = nested(levels, key.level);
      lines.push({
        path: levels.map(({ key: each }) => each),
        value: key.value,
      });
    }
  }
  return lines;
}

/** The keys at the top of each document of the file. */
export function topKeysOf(text: string): Set<string> {
  return new Set(
    keyLinesOf(text)
      .filter(({ path }) => path.length === 1)
      .map(({ path }) => path[0] ?? ''),
  );
}
