import { posix } from 'node:path';

import type { Finding } from '#harness/architecture/finding';

export interface Document {
  readonly path: string;
  readonly text: string;
}

interface Link {
  readonly target: string;
  readonly line: number;
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^#{1,6}\s+(.*?)\s*#*\s*$/;
const INLINE_CODE = /`[^`]*`/g;
const LINK = /!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const LINK_TEXT = /\[((?:[^\]\\]|\\.)*)\]\([^)]*\)/g;
const NOT_IN_A_SLUG = /[^\p{L}\p{N}\p{M}\p{Pc}\- ]/gu;
/** A target with a scheme, such as `https:`, is outside and is not read. */
const OUTSIDE = /^[a-z][a-z0-9+.-]*:/i;
const DOCUMENT = '.md';

/** The lines of a document that are text, with their numbers. */
function textLines(text: string): [number, string][] {
  const lines: [number, string][] = [];
  let fenced = false;
  for (const [index, line] of text.split('\n').entries()) {
    if (FENCE.test(line)) {
      fenced = !fenced;
    } else if (!fenced) {
      lines.push([index + 1, line]);
    }
  }
  return lines;
}

function slugOf(heading: string): string {
  return heading
    .replace(LINK_TEXT, '$1')
    .replace(/[`*]/g, '')
    .toLowerCase()
    .replace(NOT_IN_A_SLUG, '')
    .replaceAll(' ', '-');
}

/**
 * The anchors of the headings of a document, as GitHub makes them. The
 * second heading with the same text gets `-1`, the third `-2`.
 */
export function anchorsOf(text: string): string[] {
  const seen = new Map<string, number>();
  return textLines(text).flatMap(([, line]) => {
    const heading = HEADING.exec(line)?.[1];
    if (heading === undefined) {
      return [];
    }
    const slug = slugOf(heading);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    return [count === 0 ? slug : `${slug}-${String(count)}`];
  });
}

/** Every link and picture of a document. Code is not read for links. */
export function linksOf(text: string): Link[] {
  return textLines(text).flatMap(([line, content]) =>
    [...content.replace(INLINE_CODE, '').matchAll(LINK)].map((match) => ({
      target: match[1] ?? '',
      line,
    })),
  );
}

interface Tree {
  readonly files: ReadonlySet<string>;
  readonly anchors: ReadonlyMap<string, readonly string[]>;
}

function pathFrom(document: string, target: string): string {
  const folder = posix.dirname(document);
  return posix.normalize(posix.join(folder, decodeURIComponent(target)));
}

function isThere(path: string, files: ReadonlySet<string>): boolean {
  const folder = path.endsWith('/') ? path : `${path}/`;
  return files.has(path) || [...files].some((file) => file.startsWith(folder));
}

function problemOf(document: string, target: string, tree: Tree): string {
  const [file = '', anchor] = target.split('#');
  const path = file === '' ? document : pathFrom(document, file);
  if (!isThere(path, tree.files)) {
    return `"${target}" leads to no file.`;
  }
  const anchors = tree.anchors.get(path);
  const dead =
    anchor !== undefined &&
    anchor !== '' &&
    anchors?.includes(anchor) === false;
  return dead ? `"${target}" leads to no heading.` : '';
}

/**
 * Links that lead nowhere: to no file of the tree, or to no heading of a
 * document. Nothing outside the tree is read, so the check works offline.
 */
export function linkFindings(
  documents: readonly Document[],
  files: ReadonlySet<string>,
): Finding[] {
  const anchors = new Map(
    documents
      .filter((document) => document.path.endsWith(DOCUMENT))
      .map((document) => [document.path, anchorsOf(document.text)]),
  );
  return documents.flatMap((document) =>
    linksOf(document.text)
      .filter((link) => !OUTSIDE.test(link.target))
      .flatMap((link) => {
        const detail = problemOf(document.path, link.target, {
          files,
          anchors,
        });
        return detail === ''
          ? []
          : [
              {
                rule: 'dead-link',
                path: document.path,
                line: link.line,
                detail,
              },
            ];
      }),
  );
}
