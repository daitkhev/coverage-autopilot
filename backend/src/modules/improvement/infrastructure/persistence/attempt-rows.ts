import type { SQLInputValue } from 'node:sqlite';

import { Attempt } from '#improvement/domain/entities/attempt.entity';
import { TestPatch } from '#improvement/domain/value-objects/test-patch.vo';
import type { AttemptRow } from '#improvement/infrastructure/persistence/improvement-documents.schema';
import {
  generationOutputFrom,
  generationOutputText,
  verificationReportFrom,
  verificationReportText,
} from '#improvement/infrastructure/persistence/stored-documents';
import { Instant } from '#kernel/time/instant';

/** Columns and their values, as a statement with named parameters takes them. */
export type Columns = Readonly<Record<string, SQLInputValue>>;

/** An empty column stays empty, and any other is read. */
export function orNull<Value, Read>(
  value: Value | null,
  read: (value: Value) => Read,
): Read | null {
  return value === null ? null : read(value);
}

export function instantOrNull(text: string | null): Instant | null {
  return orNull(text, (stored) => Instant.parse(stored));
}

export function textOrNull(instant: Instant | null): string | null {
  return orNull(instant, (kept) => kept.toString());
}

function patchOf(row: AttemptRow): TestPatch | null {
  const { patch, patch_hash: hash } = row;
  return patch === null || hash === null
    ? null
    : TestPatch.create({ text: patch, hash });
}

export function attemptColumns(
  improvementId: string,
  attempt: Attempt,
): Columns {
  const { patch } = attempt;
  return {
    improvement_id: improvementId,
    number: attempt.number,
    generation_outcome: attempt.outcome,
    tokens_used: attempt.tokensUsed,
    patch: orNull(patch, (kept) => kept.text),
    patch_hash: orNull(patch, (kept) => kept.hash),
    verification_report: orNull(attempt.report, verificationReportText),
    generation_output: generationOutputText(attempt),
    started_at: attempt.startedAt.toString(),
    finished_at: textOrNull(attempt.finishedAt),
  };
}

/** An attempt as it was saved. A row the first version wrote has no count. */
export function attemptFrom(row: AttemptRow): Attempt {
  const output = generationOutputFrom(row.generation_output);
  return Attempt.restore({
    number: row.number,
    startedAt: Instant.parse(row.started_at),
    finishedAt: instantOrNull(row.finished_at),
    outcome: row.generation_outcome,
    tokensUsed: row.tokens_used ?? 0,
    patch: patchOf(row),
    report: orNull(row.verification_report, verificationReportFrom),
    outputReferences: output.outputReferences,
    refusedToolCalls: output.refusedToolCalls,
  });
}
