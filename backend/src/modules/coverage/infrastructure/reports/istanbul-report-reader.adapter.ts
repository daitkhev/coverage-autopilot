import { existsSync, readFileSync, realpathSync } from 'node:fs';
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

function parseReport(path: string): Record<string, IstanbulFile> {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
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
 * to that root. A file outside the copy is left out.
 */
@Injectable()
export class IstanbulReportReader implements CoverageReportReader {
  public async read(
    request: CoverageReportRequest,
  ): Promise<CoverageReport | null> {
    if (!existsSync(request.reportPath)) {
      return Promise.resolve(null);
    }
    const report = parseReport(request.reportPath);
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
