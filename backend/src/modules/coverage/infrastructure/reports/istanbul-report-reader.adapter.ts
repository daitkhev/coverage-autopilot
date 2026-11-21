import { realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';

import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type {
  CoverageReport,
  CoverageReportReader,
  CoverageReportRequest,
} from '#coverage/application/ports/coverage-report-reader.port';
import { UnreadableCoverageReportError } from '#coverage/infrastructure/errors/unreadable-coverage-report.error';
import { reportedCoverageOf } from '#coverage/infrastructure/reports/istanbul-counting';
import {
  type IstanbulFile,
  istanbulReportSchema,
} from '#coverage/infrastructure/reports/istanbul-report.schema';
import { readCopyFile, REFUSAL_WORDS } from '#infrastructure/files/copy-file';

function parseReport(path: string, text: string): Record<string, IstanbulFile> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new UnreadableCoverageReportError(
      `The coverage report ${path} is not JSON.`,
      { cause: error },
    );
  }
  const parsed = istanbulReportSchema.safeParse(json);
  if (!parsed.success) {
    throw new UnreadableCoverageReportError(
      `The coverage report ${path} is not an Istanbul report: ` +
        z.prettifyError(parsed.error),
    );
  }
  return parsed.data;
}

/**
 * The root as given and as the file system resolves it: a runner reports
 * the resolved path, such as `/private/var` for `/var` on macOS.
 */
function rootsOf(workingCopyPath: string): string[] {
  return [...new Set([workingCopyPath, realpathSync(workingCopyPath)])];
}

function insideOf(roots: readonly string[], path: string): string | null {
  const inside = roots
    .map((root) => relative(root, path))
    .find((rest) => rest !== '' && !rest.startsWith('..') && !isAbsolute(rest));
  return inside ?? null;
}

/**
 * Reads the `json` report of Istanbul. A runner sees the working copy at
 * the path the service gave it, so a path of the report is made relative
 * to that root. A file outside the copy is left out. The report itself
 * is written by code of the repository, so it is read as a plain file of
 * the copy or not at all.
 */
@Injectable()
export class IstanbulReportReader implements CoverageReportReader {
  public async read(
    request: CoverageReportRequest,
  ): Promise<CoverageReport | null> {
    const file = readCopyFile(request.workingCopyPath, request.reportPath);
    if (file.outcome === 'missing') {
      return Promise.resolve(null);
    }
    if (file.outcome === 'refused') {
      throw new UnreadableCoverageReportError(
        `The coverage report ${request.reportPath} was not read: ` +
          `${REFUSAL_WORDS[file.reason]}.`,
      );
    }
    const report = parseReport(request.reportPath, file.text);
    const roots = rootsOf(request.workingCopyPath);
    const entries = Object.entries(report).flatMap(([path, file]) => {
      const inside = insideOf(roots, path);
      return inside === null
        ? []
        : [[inside, reportedCoverageOf(file)] as const];
    });
    return Promise.resolve(new Map(entries));
  }
}
