const OLD_PREFIX = 'a/';
const NEW_PREFIX = 'b/';
const NAME_SEPARATOR = ` ${NEW_PREFIX}`;
const QUOTE = '"';
const QUOTED_SEPARATOR = '" "';
const TARGET_PREFIX = '+++ ';
const TRAILING_TAB = /\t$/u;

/** Both names of a header carry their prefix, so each takes this share. */
const NAMES_IN_A_HEADER = 2;

/**
 * A name as git writes one it has to quote: in double quotes, with C
 * escapes, and every byte above 127 as three octal digits.
 */
const QUOTED_NAME = /^"(?:[^\\"]|\\(?:[0-3][0-7]{2}|[abtnvfr"\\]))*"$/u;
const QUOTED_PIECE = /\\[0-3][0-7]{2}|\\.|[^\\]/gu;
const OCTAL = 8;
const OCTAL_DIGITS = 3;

/** The letter of each C escape and the character it stands for. */
const ESCAPE_LETTERS = 'abtnvfr"\\';
const ESCAPED_CHARACTERS = '\u0007\b\t\n\v\f\r"\\';

const REPLACEMENT_CHARACTER = '\uFFFD';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The two names of the header of one file in a patch, prefixes removed. */
export interface HeaderNames {
  readonly old: string;
  readonly new: string;
}

function bytesOfPiece(piece: string): number[] {
  if (!piece.startsWith('\\')) {
    return [...encoder.encode(piece)];
  }
  const code = piece.slice(1);
  return code.length === OCTAL_DIGITS
    ? [Number.parseInt(code, OCTAL)]
    : [
        ...encoder.encode(
          ESCAPED_CHARACTERS.charAt(ESCAPE_LETTERS.indexOf(code)),
        ),
      ];
}

/** The name inside a quoted token, or null when git would not write it so. */
function unquotedNameOf(token: string): string | null {
  if (!QUOTED_NAME.test(token)) {
    return null;
  }
  const pieces = Array.from(
    token.slice(1, -1).matchAll(QUOTED_PIECE),
    ([piece]) => piece,
  );
  const name = decoder.decode(Uint8Array.from(pieces.flatMap(bytesOfPiece)));
  return name.includes(REPLACEMENT_CHARACTER) ? null : name;
}

function withoutPrefixes(
  old: string | null,
  next: string | null,
): HeaderNames | null {
  const prefixed =
    old?.startsWith(OLD_PREFIX) === true &&
    next?.startsWith(NEW_PREFIX) === true;
  return prefixed
    ? { old: old.slice(OLD_PREFIX.length), new: next.slice(NEW_PREFIX.length) }
    : null;
}

function quotedNamesOf(names: string): HeaderNames | null {
  const split = names.indexOf(QUOTED_SEPARATOR);
  return split === -1
    ? null
    : withoutPrefixes(
        unquotedNameOf(names.slice(0, split + 1)),
        unquotedNameOf(names.slice(split + QUOTED_SEPARATOR.length - 1)),
      );
}

/**
 * Two names that are the same, as in `a/x b/x`: the one reading of a header
 * whose names hold a space, which is how git reads a new file too.
 */
function sameNamesOf(names: string): HeaderNames | null {
  const length =
    (names.length - OLD_PREFIX.length - NAME_SEPARATOR.length) /
    NAMES_IN_A_HEADER;
  const name = names.slice(OLD_PREFIX.length, OLD_PREFIX.length + length);
  return names === `${OLD_PREFIX}${name}${NAME_SEPARATOR}${name}`
    ? { old: name, new: name }
    : null;
}

function differentNamesOf(names: string): HeaderNames | null {
  const split = names.indexOf(NAME_SEPARATOR);
  return names.startsWith(OLD_PREFIX) && split !== -1
    ? {
        old: names.slice(OLD_PREFIX.length, split),
        new: names.slice(split + NAME_SEPARATOR.length),
      }
    : null;
}

/**
 * The names in the header of one file, the text after `diff --git `, or
 * null when git would not write the header so.
 */
export function headerNamesOf(names: string): HeaderNames | null {
  return names.startsWith(QUOTE)
    ? quotedNamesOf(names)
    : (sameNamesOf(names) ?? differentNamesOf(names));
}

/**
 * The name in a `+++ ` line, without its prefix, or null. git ends the line
 * with a tab when the name holds a space.
 */
export function targetNameOf(line: string): string | null {
  if (!line.startsWith(TARGET_PREFIX)) {
    return null;
  }
  const token = line.slice(TARGET_PREFIX.length).replace(TRAILING_TAB, '');
  const name = token.startsWith(QUOTE) ? unquotedNameOf(token) : token;
  return name?.startsWith(NEW_PREFIX) === true
    ? name.slice(NEW_PREFIX.length)
    : null;
}
