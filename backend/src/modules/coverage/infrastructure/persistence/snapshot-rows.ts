import type { SQLInputValue } from 'node:sqlite';

import type { z } from 'zod';

import { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import { CoverageCounter } from '#coverage/domain/value-objects/coverage-counter.vo';
import { CoverageCounters } from '#coverage/domain/value-objects/coverage-counters.vo';
import { DetectedProject } from '#coverage/domain/value-objects/detected-project.vo';
import { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import { UncoveredCode } from '#coverage/domain/value-objects/uncovered-code.vo';
import { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';
import {
  detectedProjectDocumentSchema,
  DOCUMENT_VERSION,
  type fileRowSchema,
  readDocument,
  scanParametersDocumentSchema,
  type snapshotRowSchema,
  uncoveredDocumentSchema,
  UNMEASURED_FILES_VERSION,
  unmeasuredFilesDocumentSchema,
} from '#coverage/infrastructure/persistence/snapshot-documents.schema';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';

type SnapshotRow = z.infer<typeof snapshotRowSchema>;
type FileRow = z.infer<typeof fileRowSchema>;

/** Columns and their values, as a statement with named parameters takes them. */
type Columns = Readonly<Record<string, SQLInputValue>>;

/** The row of the snapshot itself, with its totals over measured files. */
export function snapshotColumns(snapshot: CoverageSnapshot): Columns {
  const { project, parameters, totals } = snapshot;
  return {
    id: snapshot.id.value,
    repository_id: snapshot.repositoryId.value,
    commit_sha: snapshot.commit.value,
    origin_key: snapshot.originKey,
    detected_project: JSON.stringify({
      version: DOCUMENT_VERSION,
      testRunner: project.testRunner,
      testRunnerVersion: project.testRunnerVersion,
      packageManager: project.packageManager,
      configFile: project.configFile?.value ?? null,
    }),
    scan_parameters: JSON.stringify({
      version: DOCUMENT_VERSION,
      testRunner: parameters.testRunner,
      testRunnerVersion: parameters.testRunnerVersion,
      coverageProvider: parameters.coverageProvider,
      fileListRule: parameters.fileListRule,
    }),
    unmeasured_files: JSON.stringify({
      version: UNMEASURED_FILES_VERSION,
      testRunOutput: snapshot.testRunOutput,
      files: snapshot.unmeasured.map((file) => ({
        path: file.path.value,
        reason: file.reason,
        toolMessage: file.toolMessage,
      })),
      tests: snapshot.tests,
    }),
    lines_covered: totals.of('lines').covered,
    lines_total: totals.of('lines').total,
    branches_covered: totals.of('branches').covered,
    branches_total: totals.of('branches').total,
    captured_at: snapshot.capturedAt.toString(),
  };
}

export function fileColumns(snapshotId: string, file: FileCoverage): Columns {
  const { counters, uncovered } = file;
  return {
    snapshot_id: snapshotId,
    file_path: file.path.value,
    state: file.state,
    lines_covered: counters.of('lines').covered,
    lines_total: counters.of('lines').total,
    branches_covered: counters.of('branches').covered,
    branches_total: counters.of('branches').total,
    statements_covered: counters.of('statements').covered,
    statements_total: counters.of('statements').total,
    functions_covered: counters.of('functions').covered,
    functions_total: counters.of('functions').total,
    uncovered: JSON.stringify({
      version: DOCUMENT_VERSION,
      uncoveredLines: uncovered.lines,
      openBranchLines: uncovered.branchLines,
      uncoveredFunctions: uncovered.functions,
    }),
  };
}

function fileFrom(row: FileRow): FileCoverage {
  const path = FilePath.create(row.file_path);
  if (row.state === 'no_executable_code') {
    return FileCoverage.noExecutableCode(path);
  }
  const document = readDocument(
    'uncovered',
    row.uncovered,
    uncoveredDocumentSchema,
  );
  return FileCoverage.measured({
    path,
    counters: CoverageCounters.create({
      statements: CoverageCounter.create({
        covered: row.statements_covered,
        total: row.statements_total,
      }),
      branches: CoverageCounter.create({
        covered: row.branches_covered,
        total: row.branches_total,
      }),
      functions: CoverageCounter.create({
        covered: row.functions_covered,
        total: row.functions_total,
      }),
      lines: CoverageCounter.create({
        covered: row.lines_covered,
        total: row.lines_total,
      }),
    }),
    uncovered: UncoveredCode.create({
      lines: document.uncoveredLines,
      branchLines: document.openBranchLines,
      functions: document.uncoveredFunctions,
    }),
  });
}

function projectFrom(row: SnapshotRow): DetectedProject {
  const document = readDocument(
    'detected_project',
    row.detected_project,
    detectedProjectDocumentSchema,
  );
  const { configFile } = document;
  return DetectedProject.create({
    testRunner: document.testRunner,
    testRunnerVersion: document.testRunnerVersion,
    packageManager: document.packageManager,
    configFile: configFile === null ? null : FilePath.create(configFile),
  });
}

function parametersFrom(row: SnapshotRow): ScanParameters {
  const document = readDocument(
    'scan_parameters',
    row.scan_parameters,
    scanParametersDocumentSchema,
  );
  return ScanParameters.create({
    testRunner: document.testRunner,
    testRunnerVersion: document.testRunnerVersion,
    coverageProvider: document.coverageProvider,
    fileListRule: document.fileListRule,
  });
}

/** The snapshot as it was saved, from its row and the rows of its files. */
export function snapshotFrom(
  row: SnapshotRow,
  fileRows: readonly FileRow[],
): CoverageSnapshot {
  const unmeasured = readDocument(
    'unmeasured_files',
    row.unmeasured_files,
    unmeasuredFilesDocumentSchema,
  );
  return CoverageSnapshot.create({
    id: SnapshotId.create(row.id),
    repositoryId: RepositoryId.create(row.repository_id),
    commit: CommitSha.create(row.commit_sha),
    originKey: row.origin_key,
    project: projectFrom(row),
    parameters: parametersFrom(row),
    files: fileRows.map(fileFrom),
    unmeasured: unmeasured.files.map((file) =>
      UnmeasuredFile.create({
        path: FilePath.create(file.path),
        reason: file.reason,
        toolMessage: file.toolMessage,
      }),
    ),
    testRunOutput: unmeasured.testRunOutput,
    tests: unmeasured.tests,
    capturedAt: Instant.parse(row.captured_at),
  });
}
