import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ArtifactStorageError } from '#infrastructure/artifacts/errors/artifact-storage.error';
import { InvalidArtifactNameError } from '#infrastructure/artifacts/errors/invalid-artifact-name.error';
import { InvalidArtifactReferenceError } from '#infrastructure/artifacts/errors/invalid-artifact-reference.error';
import {
  ARTIFACT_DIRECTORY,
  FileArtifactStore,
} from '#infrastructure/artifacts/file-artifact-store.adapter';
import { ID_GENERATOR } from '#kernel/id/id-generator';
import { ARTIFACT_STORE, type ArtifactStore } from '#ports/artifact-store.port';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';

const OWNER = 'improvement:00000000-0000-4000-8000-0000000000aa';
const LABEL = 'attempt-2-test-run';
const OUTPUT = 'Tests  12 passed (12)\nDuration  1.20s\n';
const FIRST_TEMPORARY = '.00000000-0000-4000-8000-000000000001.tmp';

let root: string;
let store: FileArtifactStore;

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function referenceOf(content: string): string {
  return `${OWNER}/${LABEL}-${sha256(content)}.txt`;
}

function modeOf(path: string): number {
  const PERMISSIONS = 0o777;
  return statSync(path).mode & PERMISSIONS;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'artifacts-'));
  store = new FileArtifactStore(root, new SequentialIdGenerator());
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('FileArtifactStore', () => {
  describe('save', () => {
    it('should name the file by the owner, the label and the hash', async () => {
      const reference = await store.save({
        owner: OWNER,
        label: LABEL,
        content: OUTPUT,
      });

      expect(reference).toBe(referenceOf(OUTPUT));
      expect(readdirSync(join(root, OWNER))).toEqual([
        `${LABEL}-${sha256(OUTPUT)}.txt`,
      ]);
    });

    it('should give the same reference for the same content', async () => {
      const request = { owner: OWNER, label: LABEL, content: OUTPUT };

      const first = await store.save(request);
      const second = await store.save(request);

      expect(second).toBe(first);
      expect(readdirSync(join(root, OWNER))).toHaveLength(1);
    });

    it('should give another reference for other content', async () => {
      const first = await store.save({
        owner: OWNER,
        label: LABEL,
        content: 'a',
      });
      const second = await store.save({
        owner: OWNER,
        label: LABEL,
        content: 'b',
      });

      expect(second).not.toBe(first);
    });

    it('should keep the folder and the file to their owner alone', async () => {
      const reference = await store.save({
        owner: OWNER,
        label: LABEL,
        content: OUTPUT,
      });

      expect(modeOf(join(root, OWNER))).toBe(0o700);
      expect(modeOf(join(root, reference))).toBe(0o600);
    });

    it('should write under a temporary name of its own and rename it', async () => {
      mkdirSync(join(root, OWNER));
      writeFileSync(join(root, OWNER, FIRST_TEMPORARY), 'another writer');

      await expect(
        store.save({ owner: OWNER, label: LABEL, content: OUTPUT }),
      ).rejects.toThrow(
        new ArtifactStorageError(
          `The output ${referenceOf(OUTPUT)} could not be saved.`,
        ),
      );
      expect(readdirSync(join(root, OWNER))).toEqual([FIRST_TEMPORARY]);
    });

    describe('when the owner or the label could lead outside the folder', () => {
      it.each([
        ['owner', '..'],
        ['owner', '../outside'],
        ['owner', 'improvement/1'],
        ['owner', 'improvement\\1'],
        ['owner', ''],
        ['label', '.hidden'],
        ['label', 'run..2'],
        ['label', 'runé'],
        ['label', 'a'.repeat(129)],
      ])(
        'should throw InvalidArtifactNameError for the %s "%s"',
        async (role, name) => {
          const request = { owner: OWNER, label: LABEL, content: OUTPUT };

          await expect(
            store.save({ ...request, [role]: name }),
          ).rejects.toThrow(
            new InvalidArtifactNameError(
              `The ${role} "${name}" cannot name stored output. A name has up ` +
                'to 128 letters, digits, ".", "_", ":" and "-", starts with a ' +
                'letter or a digit, and has no "..".',
            ),
          );
          expect(readdirSync(root)).toEqual([]);
        },
      );
    });

    describe('when the folder cannot be written', () => {
      it('should throw ArtifactStorageError, which a second try may pass', async () => {
        const file = join(root, 'not-a-folder');
        writeFileSync(file, '');
        const blocked = new FileArtifactStore(
          file,
          new SequentialIdGenerator(),
        );

        const saving = blocked.save({
          owner: OWNER,
          label: LABEL,
          content: 'a',
        });

        await expect(saving).rejects.toThrow(ArtifactStorageError);
        await expect(saving).rejects.toMatchObject({ retryable: true });
      });
    });
  });

  describe('read', () => {
    it('should give back what was saved', async () => {
      const content = 'ÿ ✓ 測試\n'.repeat(1_000);
      const reference = await store.save({
        owner: OWNER,
        label: LABEL,
        content,
      });

      await expect(store.read(reference)).resolves.toBe(content);
    });

    it('should read a file that is gone as null', async () => {
      const reference = await store.save({
        owner: OWNER,
        label: LABEL,
        content: OUTPUT,
      });
      rmSync(join(root, reference));

      await expect(store.read(reference)).resolves.toBeNull();
      await expect(store.read(referenceOf('never saved'))).resolves.toBeNull();
    });

    it('should read a file whose content no longer has its hash as null', async () => {
      const reference = await store.save({
        owner: OWNER,
        label: LABEL,
        content: OUTPUT,
      });
      writeFileSync(join(root, reference), 'changed by a late writer');

      await expect(store.read(reference)).resolves.toBeNull();
    });

    describe('when the reference is not one the store gives', () => {
      it.each([
        '../../etc/passwd',
        `${OWNER}/${LABEL}.txt`,
        `${OWNER}/../${LABEL}-${sha256('a')}.txt`,
        `a..b/${LABEL}-${sha256('a')}.txt`,
        `/${OWNER}/${LABEL}-${sha256('a')}.txt`,
      ])(
        'should throw InvalidArtifactReferenceError for "%s"',
        async (text) => {
          await expect(store.read(text)).rejects.toThrow(
            new InvalidArtifactReferenceError(
              `"${text}" is not a reference the store of tool output gives.`,
            ),
          );
        },
      );
    });

    describe('when the file system refuses the read', () => {
      it('should throw ArtifactStorageError', async () => {
        writeFileSync(join(root, OWNER), 'a file where a folder belongs');
        const reference = referenceOf(OUTPUT);

        await expect(store.read(reference)).rejects.toThrow(
          new ArtifactStorageError(
            `The output ${reference} could not be read.`,
          ),
        );
      });
    });
  });

  describe('pathOf', () => {
    it('should say the absolute path of the file of a reference', async () => {
      const reference = await store.save({
        owner: OWNER,
        label: LABEL,
        content: OUTPUT,
      });

      expect(store.pathOf(reference)).toBe(join(root, reference));
      expect(readFileSync(store.pathOf(reference), 'utf8')).toBe(OUTPUT);
    });

    it('should make the path absolute when the folder was given relative', () => {
      const relative = new FileArtifactStore(
        'instance/artifacts',
        new SequentialIdGenerator(),
      );

      expect(relative.pathOf(referenceOf(OUTPUT))).toBe(
        resolve('instance/artifacts', referenceOf(OUTPUT)),
      );
    });

    it('should say where a file that is gone was kept', () => {
      expect(store.pathOf(referenceOf('never saved'))).toBe(
        join(root, referenceOf('never saved')),
      );
    });

    describe('when the reference is not one the store gives', () => {
      it('should throw InvalidArtifactReferenceError rather than lead outside', () => {
        expect(() => store.pathOf('../../etc/passwd')).toThrow(
          new InvalidArtifactReferenceError(
            '"../../etc/passwd" is not a reference the store of tool ' +
              'output gives.',
          ),
        );
      });
    });
  });

  describe('when it is injected by its token', () => {
    it('should be the store of tool output, kept in the folder it is given', async () => {
      const module = await Test.createTestingModule({
        providers: [
          { provide: ARTIFACT_STORE, useClass: FileArtifactStore },
          { provide: ARTIFACT_DIRECTORY, useValue: root },
          { provide: ID_GENERATOR, useClass: SequentialIdGenerator },
        ],
      }).compile();
      const injected = module.get<ArtifactStore>(ARTIFACT_STORE);

      const reference = await injected.save({
        owner: OWNER,
        label: LABEL,
        content: OUTPUT,
      });

      expect(injected).toBeInstanceOf(FileArtifactStore);
      expect(readdirSync(join(root, OWNER))).toHaveLength(1);
      await expect(store.read(reference)).resolves.toBe(OUTPUT);
    });
  });
});
