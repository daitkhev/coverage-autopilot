import type { ReportedCoverage } from '#coverage/domain/services/file-state.service';
import { CoverageCounter } from '#coverage/domain/value-objects/coverage-counter.vo';
import { CoverageCounters } from '#coverage/domain/value-objects/coverage-counters.vo';
import {
  type LineRange,
  UncoveredCode,
} from '#coverage/domain/value-objects/uncovered-code.vo';
import type { IstanbulFile } from '#coverage/infrastructure/reports/istanbul-report.schema';

function counterOf(hits: readonly number[]): CoverageCounter {
  return CoverageCounter.create({
    covered: hits.filter((count) => count > 0).length,
    total: hits.length,
  });
}

/**
 * The hits of each line, as Istanbul counts them: a line is the line a
 * statement starts on, and it ran when one of its statements ran.
 */
function lineHits(file: IstanbulFile): Map<number, number> {
  const lines = new Map<number, number>();
  for (const [id, statement] of Object.entries(file.statementMap)) {
    const { line } = statement.start;
    lines.set(line, Math.max(lines.get(line) ?? 0, file.s[id] ?? 0));
  }
  return lines;
}

function ascending(numbers: Iterable<number>): number[] {
  return [...new Set(numbers)].sort((left, right) => left - right);
}

/** Lines that follow each other become one range. */
function rangesOf(lines: readonly number[]): LineRange[] {
  const ranges: LineRange[] = [];
  for (const line of lines) {
    const last = ranges.at(-1);
    if (last?.end === line - 1) {
      ranges[ranges.length - 1] = { start: last.start, end: line };
    } else {
      ranges.push({ start: line, end: line });
    }
  }
  return ranges;
}

function uncoveredOf(
  file: IstanbulFile,
  lines: Map<number, number>,
): UncoveredCode {
  const missedLines = [...lines].filter(([, hit]) => hit === 0);
  const openBranches = Object.entries(file.branchMap).filter(([id]) =>
    (file.b[id] ?? []).includes(0),
  );
  const missedFunctions = Object.entries(file.fnMap)
    .filter(([id]) => file.f[id] === 0)
    .map(([, fn]) => ({ name: fn.name, line: fn.decl.start.line }))
    .sort((left, right) => left.line - right.line);
  return UncoveredCode.create({
    lines: rangesOf(ascending(missedLines.map(([line]) => line))),
    branchLines: ascending(
      openBranches.map(([, branch]) => branch.loc.start.line),
    ),
    functions: missedFunctions,
  });
}

/** The four counters and what never ran, from one file of a report. */
export function reportedCoverageOf(file: IstanbulFile): ReportedCoverage {
  const lines = lineHits(file);
  return {
    counters: CoverageCounters.create({
      statements: counterOf(Object.values(file.s)),
      branches: counterOf(Object.values(file.b).flat()),
      functions: counterOf(Object.values(file.f)),
      lines: counterOf([...lines.values()]),
    }),
    uncovered: uncoveredOf(file, lines),
  };
}
