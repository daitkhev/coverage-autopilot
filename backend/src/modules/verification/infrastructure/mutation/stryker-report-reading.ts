import { join } from 'node:path';

import { z } from 'zod';

import { readCopyFile, REFUSAL_WORDS } from '#infrastructure/files/copy-file';
import { UnreadableMutationReportError } from '#verification/infrastructure/errors/unreadable-mutation-report.error';
import {
  type StrykerReport,
  strykerReportSchema,
} from '#verification/infrastructure/mutation/stryker-report.schema';

type ReportReading =
  | { readonly outcome: 'read'; readonly report: StrykerReport }
  | { readonly outcome: 'missing' }
  | { readonly outcome: 'invalid'; readonly problem: string };

type ParsedReport = Exclude<ReportReading, { readonly outcome: 'missing' }>;

/** The text as a mutation report, or what is wrong with it. */
export function parseStrykerReport(text: string): ParsedReport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { outcome: 'invalid', problem: 'it is not JSON' };
  }
  const parsed = strykerReportSchema.safeParse(json);
  return parsed.success
    ? { outcome: 'read', report: parsed.data }
    : {
        outcome: 'invalid',
        problem: `it is not a mutation report: ${z.prettifyError(parsed.error)}`,
      };
}

/**
 * Reads a file StrykerJS wrote into the working copy, by its path in the
 * copy. Code of the repository ran in the copy as well, so a link, a file
 * outside of it and a file larger than any report are a fault, refused
 * before a byte is read.
 */
export function readStrykerReport(root: string, file: string): ReportReading {
  const read = readCopyFile(root, join(root, file));
  if (read.outcome === 'refused') {
    throw new UnreadableMutationReportError(
      `${file} was not read: ${REFUSAL_WORDS[read.reason]}.`,
    );
  }
  return read.outcome === 'missing' ? read : parseStrykerReport(read.text);
}
