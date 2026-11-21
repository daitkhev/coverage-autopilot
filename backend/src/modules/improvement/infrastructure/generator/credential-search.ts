import { join } from 'node:path';

import { holdsCredential } from '#improvement/infrastructure/generator/credential-text';
import type { GeneratorSettings } from '#improvement/infrastructure/generator/generator-settings';
import { readCopyFile, REFUSAL_WORDS } from '#infrastructure/files/copy-file';

/** What the search of the written files found. */
export interface CredentialSearch {
  /** Whether a written file holds the credential, in its name or its text. */
  readonly exposed: boolean;
  /** The written files that were not read, and why, for the raw output. */
  readonly notes: readonly string[];
}

interface Finding {
  readonly exposed: boolean;
  readonly notes: readonly string[];
}

const CLEAN: Finding = { exposed: false, notes: [] };

function findingOf(
  root: string,
  path: string,
  settings: GeneratorSettings,
): Finding {
  const credential = settings.credential.value;
  if (holdsCredential(path, credential)) {
    return { exposed: true, notes: [] };
  }
  const file = readCopyFile(root, join(root, path), settings.scan.maxFileBytes);
  if (file.outcome === 'refused') {
    return {
      exposed: false,
      notes: [`${path} was not searched: ${REFUSAL_WORDS[file.reason]}.`],
    };
  }
  return file.outcome === 'read' && holdsCredential(file.text, credential)
    ? { exposed: true, notes: [] }
    : CLEAN;
}

function skippedNotes(skipped: number): string[] {
  return skipped > 0
    ? [`${String(skipped)} more written files were not searched.`]
    : [];
}

/**
 * Searches every file a run wrote for the exact value of the credential,
 * as far as the settings allow. A file read refuses, such as a link or
 * one too large, still counts as written: it is noted and not a fault.
 */
export function searchCredential(
  root: string,
  written: readonly string[],
  settings: GeneratorSettings,
): CredentialSearch {
  const searched = written.slice(0, settings.scan.maxFiles);
  const findings = searched.map((path) => findingOf(root, path, settings));
  return {
    exposed: findings.some((finding) => finding.exposed),
    notes: [
      ...findings.flatMap((finding) => finding.notes),
      ...skippedNotes(written.length - searched.length),
    ],
  };
}
