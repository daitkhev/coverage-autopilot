import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import { ArtifactStorageError } from '#infrastructure/artifacts/errors/artifact-storage.error';
import { InvalidArtifactNameError } from '#infrastructure/artifacts/errors/invalid-artifact-name.error';
import { InvalidArtifactReferenceError } from '#infrastructure/artifacts/errors/invalid-artifact-reference.error';
import { ID_GENERATOR, type IdGenerator } from '#kernel/id/id-generator';
import type {
  ArtifactReference,
  ArtifactStore,
  SaveArtifactRequest,
} from '#ports/artifact-store.port';

/** The injection token of the folder the store keeps its files in. */
export const ARTIFACT_DIRECTORY = Symbol('ArtifactDirectory');

/**
 * Letters, digits, `.`, `_`, `:` and `-`, from a letter or a digit on. Such
 * a name has no separator, so it is one entry of a folder, and it is never
 * `.` or `..`. A file name stays far below the limit of 255 bytes.
 */
const NAME_PART = '[A-Za-z0-9][A-Za-z0-9._:-]{0,127}';
const NAME = new RegExp(`^${NAME_PART}$`);
const REFERENCE = new RegExp(
  `^${NAME_PART}/${NAME_PART}-([0-9a-f]{64})\\.txt$`,
);

/** Refused inside a name as well, so that no name reads as a way up. */
const WAY_UP = '..';

/** The instance folder is its owner's alone, and so is what is in it. */
const PRIVATE_FOLDER = 0o700;
const PRIVATE_FILE = 0o600;

const MISSING = 'ENOENT';

function isName(text: string): boolean {
  return NAME.test(text) && !text.includes(WAY_UP);
}

function checkName(role: string, text: string): void {
  if (!isName(text)) {
    throw new InvalidArtifactNameError(
      `The ${role} "${text}" cannot name stored output. A name has up to ` +
        '128 letters, digits, ".", "_", ":" and "-", starts with a letter ' +
        'or a digit, and has no "..".',
    );
  }
}

/** The hash a reference names, or nothing for a text `save` never gives. */
function digestOf(reference: string): string | undefined {
  return reference.includes(WAY_UP)
    ? undefined
    : REFERENCE.exec(reference)?.[1];
}

function invalidReference(text: string): InvalidArtifactReferenceError {
  return new InvalidArtifactReferenceError(
    `"${text}" is not a reference the store of tool output gives.`,
  );
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === MISSING;
}

/**
 * Keeps the raw output of the tools as files under one folder:
 * `<owner>/<label>-<sha256>.txt`. A file is written under a temporary name
 * and renamed, so a reader never sees half of it. The hash is checked on
 * every read, so a damaged file reads as missing and never as other text.
 */
@Injectable()
export class FileArtifactStore implements ArtifactStore {
  private readonly directory: string;
  private readonly ids: IdGenerator;

  public constructor(
    @Inject(ARTIFACT_DIRECTORY) directory: string,
    @Inject(ID_GENERATOR) ids: IdGenerator,
  ) {
    this.directory = directory;
    this.ids = ids;
  }

  public async save(request: SaveArtifactRequest): Promise<ArtifactReference> {
    checkName('owner', request.owner);
    checkName('label', request.label);
    const bytes = Buffer.from(request.content, 'utf8');
    const reference = `${request.owner}/${request.label}-${sha256(bytes)}.txt`;
    const folder = join(this.directory, request.owner);
    const temporary = join(folder, `.${this.ids.generate()}.tmp`);
    try {
      await mkdir(folder, { recursive: true, mode: PRIVATE_FOLDER });
      await writeFile(temporary, bytes, { mode: PRIVATE_FILE, flag: 'wx' });
      await rename(temporary, join(this.directory, reference));
    } catch (error) {
      throw new ArtifactStorageError(
        `The output ${reference} could not be saved.`,
        { cause: error },
      );
    }
    return reference;
  }

  public async read(reference: ArtifactReference): Promise<string | null> {
    const digest = digestOf(reference);
    if (digest === undefined) {
      throw invalidReference(reference);
    }
    const bytes = await this.bytesOf(reference);
    return bytes !== null && sha256(bytes) === digest
      ? bytes.toString('utf8')
      : null;
  }

  /**
   * A text `save` never gives is refused here too, so no path leads out
   * of the folder. The path is absolute even when the folder was given
   * relative.
   */
  public pathOf(reference: ArtifactReference): string {
    if (digestOf(reference) === undefined) {
      throw invalidReference(reference);
    }
    return resolve(this.directory, reference);
  }

  private async bytesOf(reference: ArtifactReference): Promise<Buffer | null> {
    try {
      return await readFile(join(this.directory, reference));
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw new ArtifactStorageError(
        `The output ${reference} could not be read.`,
        { cause: error },
      );
    }
  }
}
