/** Characters that end one simple command and start the next. */
const SEPARATORS = ';|&\n()`';
const SPACES = ' \t';
const QUOTES = '"\'';
const ESCAPE = '\\';

/** The mark of a here-document, with the word that ends it. */
const DOCUMENT = /(?<!<)<<(?!<)-?\s*(?<quote>['"]?)(?<end>\w+)\k<quote>/;

/** A single quote keeps every character as it is, the escape too. */
const STRONG_QUOTE = "'";

interface Scan {
  readonly commands: string[][];
  words: string[];
  word: string | undefined;
  quote: string | undefined;
}

function add(scan: Scan, text: string): void {
  scan.word = (scan.word ?? '') + text;
}

function endWord(scan: Scan): void {
  if (scan.word !== undefined) {
    scan.words.push(scan.word);
    scan.word = undefined;
  }
}

function endCommand(scan: Scan): void {
  endWord(scan);
  if (scan.words.length > 0) {
    scan.commands.push(scan.words);
    scan.words = [];
  }
}

function take(scan: Scan, character: string): void {
  if (scan.quote !== undefined) {
    if (character === scan.quote) {
      scan.quote = undefined;
    } else {
      add(scan, character);
    }
  } else if (QUOTES.includes(character)) {
    scan.quote = character;
    add(scan, '');
  } else if (SEPARATORS.includes(character)) {
    endCommand(scan);
  } else if (SPACES.includes(character)) {
    endWord(scan);
  } else {
    add(scan, character);
  }
}

/**
 * A shell gives the lines after a here-document mark to a program as
 * data, up to a line that holds the word of the mark alone. They are the
 * content of a file and not commands, so they are left out.
 */
function withoutDocuments(text: string): string {
  const kept: string[] = [];
  let end: string | undefined;
  for (const line of text.split('\n')) {
    if (end === undefined) {
      kept.push(line);
      end = DOCUMENT.exec(line)?.groups?.['end'];
    } else if (line.trim() === end) {
      end = undefined;
    }
  }
  return kept.join('\n');
}

/**
 * Splits the text of a shell command into its simple commands, each a
 * list of words. Quotes hold a word together and are left out of it. This
 * reads the text and is not a shell: a variable stays a name, and what a
 * quoted text would run is not looked into.
 */
export function simpleCommandsOf(text: string): string[][] {
  const scan: Scan = {
    commands: [],
    words: [],
    word: undefined,
    quote: undefined,
  };
  let escaped = false;
  for (const character of withoutDocuments(text)) {
    if (escaped) {
      add(scan, character);
      escaped = false;
    } else if (character === ESCAPE && scan.quote !== STRONG_QUOTE) {
      escaped = true;
    } else {
      take(scan, character);
    }
  }
  endCommand(scan);
  return scan.commands;
}
