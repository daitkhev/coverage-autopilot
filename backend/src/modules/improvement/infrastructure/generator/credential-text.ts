import { plainLine } from '#improvement/infrastructure/generator/plain-line';

/** What stands where the credential was. */
const HIDDEN = '[credential]';

/** Whether a text holds the exact value. An empty value is in no text. */
export function holdsCredential(text: string, credential: string): boolean {
  return credential !== '' && text.includes(credential);
}

/**
 * The text with every occurrence of the credential replaced: as it is,
 * and as JSON writes it inside a string, since the output of the CLI is
 * lines of JSON.
 */
export function withoutCredential(text: string, credential: string): string {
  if (credential === '') {
    return text;
  }
  const forms = new Set([credential, JSON.stringify(credential).slice(1, -1)]);
  return [...forms].reduce(
    (hidden, form) => hidden.replaceAll(form, HIDDEN),
    text,
  );
}

/**
 * A text of the CLI or of the repository as it may leave the adapter, in
 * a message, a log or the client: without the credential, then on one
 * short line. The credential goes first, so the cut never leaves a part
 * of it.
 */
export function shortText(
  text: string,
  credential: string,
  most: number,
): string {
  return plainLine(withoutCredential(text, credential), most);
}
