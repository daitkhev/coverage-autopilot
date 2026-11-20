import { readFileSync } from 'node:fs';

import { HarnessError } from '#harness/shared/harness.error';

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

/** Reads a JSON file whose top level must be an object. */
export function readJsonRecord(path: string): JsonRecord {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) {
    throw new HarnessError(`${path} must hold a JSON object.`);
  }
  return parsed;
}

export function recordAt(record: JsonRecord, key: string): JsonRecord {
  const value = record[key];
  if (!isRecord(value)) {
    throw new HarnessError(`"${key}" must be an object.`);
  }
  return value;
}

export function stringListAt(record: JsonRecord, key: string): string[] {
  const value = record[key];
  if (!isStringList(value)) {
    throw new HarnessError(`"${key}" must be a list of strings.`);
  }
  return value;
}

export function numberAt(record: JsonRecord, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HarnessError(`"${key}" must be a number.`);
  }
  return value;
}
