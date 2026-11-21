import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { InvalidMigrationFileError } from '#infrastructure/database/errors/invalid-migration-file.error';

/** One numbered SQL file. Its number is the version it brings a database to. */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

/**
 * `backend/migrations/`, found from this file, so where the service is
 * started from does not matter.
 */
export const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL('../../../../migrations/', import.meta.url),
);

const FILE_NAME = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/;

/** Files of the system, such as `.DS_Store`, are not migrations. */
const HIDDEN = '.';

function versionOf(file: string, expected: number): number {
  const digits = FILE_NAME.exec(file)?.[1];
  if (digits === undefined) {
    throw new InvalidMigrationFileError(
      `${file} is not named <four digits>-<kebab-case words>.sql.`,
    );
  }
  const version = Number(digits);
  if (version !== expected) {
    throw new InvalidMigrationFileError(
      `${file} has version ${String(version)}, and the next version is ` +
        `${String(expected)}. The versions start at 1 and have no gaps.`,
    );
  }
  return version;
}

/** The migrations in a folder, in the order they are applied. */
export function readMigrations(directory: string): Migration[] {
  const files = readdirSync(directory)
    .filter((file) => !file.startsWith(HIDDEN))
    .sort();
  return files.map((file, index) => ({
    version: versionOf(file, index + 1),
    name: file,
    sql: readFileSync(join(directory, file), 'utf8'),
  }));
}
