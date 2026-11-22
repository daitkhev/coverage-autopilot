import type {
  CoverageCounterDto,
  CoverageCountersDto,
  CoverageSnapshotDto,
  CoverageThresholdDto,
  DetectedProjectDto,
  FileCoverageDto,
  FileSplitDto,
  MeasuredRunFileDto,
  RunFileDto,
  ScanParametersDto,
} from '#coverage/application/contracts/coverage-public-api';
import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import type { CoverageCounter } from '#coverage/domain/value-objects/coverage-counter.vo';
import type { CoverageCounters } from '#coverage/domain/value-objects/coverage-counters.vo';
import type { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import type { DetectedProject } from '#coverage/domain/value-objects/detected-project.vo';
import { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import type { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import type { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';

function counterDtoOf(counter: CoverageCounter): CoverageCounterDto {
  return {
    covered: counter.covered,
    total: counter.total,
    percentage: counter.percentage()?.value ?? null,
  };
}

function countersDtoOf(counters: CoverageCounters): CoverageCountersDto {
  return {
    statements: counterDtoOf(counters.of('statements')),
    branches: counterDtoOf(counters.of('branches')),
    functions: counterDtoOf(counters.of('functions')),
    lines: counterDtoOf(counters.of('lines')),
  };
}

export function thresholdDtoOf(
  threshold: CoverageThreshold,
): CoverageThresholdDto {
  return { metric: threshold.metric, percentage: threshold.percentage.value };
}

export function projectDtoOf(project: DetectedProject): DetectedProjectDto {
  return {
    testRunner: project.testRunner,
    testRunnerVersion: project.testRunnerVersion,
    packageManager: project.packageManager,
    configFile: project.configFile,
  };
}

export function parametersDtoOf(parameters: ScanParameters): ScanParametersDto {
  return {
    testRunner: parameters.testRunner,
    testRunnerVersion: parameters.testRunnerVersion,
    coverageProvider: parameters.coverageProvider,
    fileListRule: parameters.fileListRule,
  };
}

/** A measured file, with its numbers and what never ran. */
function measuredDtoOf(file: FileCoverage): MeasuredRunFileDto {
  return {
    path: file.path,
    state: 'measured',
    counters: countersDtoOf(file.counters),
    uncoveredLines: file.uncovered.lines,
    openBranchLines: file.uncovered.branchLines,
    uncoveredFunctions: file.uncovered.functions,
  };
}

/** A file in any of its three states, a measured one as `measured` says. */
function dtoOf<Measured>(
  file: FileCoverage | UnmeasuredFile,
  measured: (file: FileCoverage) => Measured,
): Measured | Exclude<RunFileDto, MeasuredRunFileDto> {
  if (!(file instanceof FileCoverage)) {
    return {
      path: file.path,
      state: 'unmeasured',
      reason: file.reason,
      toolMessage: file.toolMessage,
    };
  }
  return file.state === 'measured'
    ? measured(file)
    : { path: file.path, state: 'no_executable_code' };
}

/** A file as a run of tests measured it, judged by no threshold. */
export function runFileDtoOf(file: FileCoverage | UnmeasuredFile): RunFileDto {
  return dtoOf(file, measuredDtoOf);
}

/** A file, a measured one with whether it is below the threshold. */
export function fileDtoOf(
  file: FileCoverage | UnmeasuredFile,
  threshold: CoverageThreshold,
): FileCoverageDto {
  return dtoOf(file, (measured) => ({
    ...measuredDtoOf(measured),
    belowThreshold: measured.canBeTarget(threshold),
  }));
}

function splitOf(
  snapshot: CoverageSnapshot,
  threshold: CoverageThreshold,
): FileSplitDto {
  const measured = snapshot.files.filter((file) => file.state === 'measured');
  const below = snapshot.targets(threshold).length;
  return {
    below,
    above: measured.length - below,
    unmeasured: snapshot.unmeasured.length,
    noCode: snapshot.files.length - measured.length,
  };
}

export function snapshotDtoOf(
  snapshot: CoverageSnapshot,
  threshold: CoverageThreshold,
): CoverageSnapshotDto {
  return {
    id: snapshot.id.value,
    repositoryId: snapshot.repositoryId,
    commit: snapshot.commit,
    originKey: snapshot.originKey,
    capturedAt: snapshot.capturedAt,
    project: projectDtoOf(snapshot.project),
    parameters: parametersDtoOf(snapshot.parameters),
    totals: countersDtoOf(snapshot.totals),
    threshold: thresholdDtoOf(threshold),
    files: splitOf(snapshot, threshold),
    testRunOutput: snapshot.testRunOutput,
  };
}
