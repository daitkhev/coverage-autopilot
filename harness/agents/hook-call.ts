import { HarnessError } from '#harness/shared/harness.error';
import { isRecord, type JsonRecord } from '#harness/shared/json';

/** What an agent wrote to a hook: one JSON object. */
export function hookCallOf(input: string): JsonRecord {
  const call: unknown = JSON.parse(input);
  if (!isRecord(call)) {
    throw new HarnessError('The input of the hook must be a JSON object.');
  }
  return call;
}
