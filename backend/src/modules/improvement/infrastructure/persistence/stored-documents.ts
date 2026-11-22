import { GeneratorConfig } from '#improvement/domain/value-objects/generator-config.vo';
import { QualityPolicy } from '#improvement/domain/value-objects/quality-policy.vo';
import { VerificationBaseline } from '#improvement/domain/value-objects/verification-baseline.vo';
import {
  type CheckResult,
  VerificationReport,
} from '#improvement/domain/value-objects/verification-report.vo';
import {
  DOCUMENT_VERSION,
  documentOf,
  generationOutputDocumentSchema,
  generatorConfigDocumentSchema,
  qualityPolicyDocumentSchema,
  REPORT_DOCUMENT_VERSION,
  verificationBaselineDocumentSchema,
  verificationReportDocumentSchema,
} from '#improvement/infrastructure/persistence/improvement-documents.schema';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';

/** A mutant as the domain holds it, with its file as a path of git. */
function withPath<Item extends { readonly file: string }>(
  item: Item,
): Omit<Item, 'file'> & { readonly file: FilePath } {
  return { ...item, file: FilePath.create(item.file) };
}

/** A mutant as a document holds it, with its file as text. */
function withText<Item extends { readonly file: FilePath }>(
  item: Item,
): Omit<Item, 'file'> & { readonly file: string } {
  return { ...item, file: item.file.value };
}

/** The version is the first key, so a person who reads the row sees it. */
function written(document: object, version = DOCUMENT_VERSION): string {
  return JSON.stringify({ version, ...document });
}

/** A check as a document holds it, with the file of its failure as text. */
function checkText(check: CheckResult): object {
  const { testFailure } = check;
  return {
    ...check,
    testFailure: testFailure === null ? null : withText(testFailure),
  };
}

export function qualityPolicyText(policy: QualityPolicy): string {
  return written({
    requiredChecks: policy.requiredChecks,
    repeatedRuns: policy.repeatedRuns,
    mutationThreshold: policy.mutationThreshold,
  });
}

export function qualityPolicyFrom(json: string): QualityPolicy {
  const document = documentOf(json, qualityPolicyDocumentSchema);
  return QualityPolicy.create({
    requiredChecks: document.requiredChecks,
    repeatedRuns: document.repeatedRuns,
    mutationThreshold: document.mutationThreshold,
  });
}

export function generatorConfigText(generator: GeneratorConfig): string {
  return written({
    cli: generator.cli,
    model: generator.model,
    promptVersion: generator.promptVersion,
    billing: generator.billing,
  });
}

export function generatorConfigFrom(json: string): GeneratorConfig {
  const document = documentOf(json, generatorConfigDocumentSchema);
  return GeneratorConfig.create({
    cli: document.cli,
    model: document.model,
    promptVersion: document.promptVersion,
    billing: document.billing,
  });
}

export function verificationBaselineText(
  baseline: VerificationBaseline,
): string {
  const { mutation } = baseline;
  return written({
    commit: baseline.commit.value,
    targetFile: baseline.targetFile.value,
    typeCheck: baseline.typeCheck,
    existingTests: baseline.existingTests,
    mutation:
      mutation === null
        ? null
        : { ...mutation, undetected: mutation.undetected.map(withText) },
  });
}

export function verificationBaselineFrom(json: string): VerificationBaseline {
  const document = documentOf(json, verificationBaselineDocumentSchema);
  const { mutation } = document;
  return VerificationBaseline.create({
    commit: CommitSha.create(document.commit),
    targetFile: FilePath.create(document.targetFile),
    typeCheck: document.typeCheck,
    existingTests: document.existingTests,
    mutation:
      mutation === null
        ? null
        : { ...mutation, undetected: mutation.undetected.map(withPath) },
  });
}

/** What the calls of the generator in one attempt left behind. */
export interface GenerationOutput {
  readonly outputReferences: readonly string[];
  readonly refusedToolCalls: readonly string[];
}

/** Nothing left behind is no document, as the column is before a call. */
export function generationOutputText(output: GenerationOutput): string | null {
  const { outputReferences, refusedToolCalls } = output;
  return outputReferences.length + refusedToolCalls.length === 0
    ? null
    : written({ outputReferences, refusedToolCalls });
}

/** An attempt stored before its first call ended has no document. */
export function generationOutputFrom(json: string | null): GenerationOutput {
  return json === null
    ? { outputReferences: [], refusedToolCalls: [] }
    : documentOf(json, generationOutputDocumentSchema);
}

export function verificationReportText(report: VerificationReport): string {
  return written(
    {
      patchHash: report.patchHash,
      verdict: report.verdict,
      reasons: report.reasons,
      checks: report.checks.map(checkText),
      coverageBefore: report.coverageBefore,
      coverageAfter: report.coverageAfter,
      mutants: report.mutants,
      survivingMutants: report.survivingMutants.map(withText),
    },
    REPORT_DOCUMENT_VERSION,
  );
}

export function verificationReportFrom(json: string): VerificationReport {
  const document = documentOf(json, verificationReportDocumentSchema);
  return VerificationReport.create({
    patchHash: document.patchHash,
    verdict: document.verdict,
    reasons: document.reasons,
    checks: document.checks.map((check) => ({
      ...check,
      testFailure:
        check.testFailure === null ? null : withPath(check.testFailure),
    })),
    coverageBefore: document.coverageBefore,
    coverageAfter: document.coverageAfter,
    mutants: document.mutants,
    survivingMutants: document.survivingMutants.map(withPath),
  });
}
