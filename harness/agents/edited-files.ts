import { resolve } from 'node:path';

import { HarnessError } from '#harness/shared/harness.error';
import { type JsonRecord, recordAt, stringAt } from '#harness/shared/json';

/** The fields in which an edit tool of Claude Code names its file. */
const PATH_FIELDS = ['file_path', 'notebook_path'];

/** The lines of a patch of Codex that name a file. */
const PATCH_FILE =
  /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;

/** A patch names its files from the folder the agent works in. */
function patchedFiles(patch: string, call: JsonRecord): string[] {
  const folder = stringAt(call, 'cwd');
  const files = [...patch.matchAll(PATCH_FILE)].map((line) =>
    resolve(folder, (line[1] ?? '').trim()),
  );
  if (files.length === 0) {
    throw new HarnessError('The patch names no file.');
  }
  return files;
}

/**
 * The files an edit changes, as the call of the edit tool names them.
 * Claude Code gives one path in a field. Codex gives the text of a patch,
 * which may change several files.
 */
export function editedFilesOf(call: JsonRecord): string[] {
  const edit = recordAt(call, 'tool_input');
  const patch = edit['command'];
  if (typeof patch === 'string') {
    return patchedFiles(patch, call);
  }
  const path = PATH_FIELDS.map((field) => edit[field]).find(
    (value): value is string => typeof value === 'string',
  );
  if (path === undefined) {
    throw new HarnessError('The edit names no file.');
  }
  return [path];
}
