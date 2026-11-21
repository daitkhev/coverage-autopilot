import { mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';
import {
  capped,
  detailOf,
  scrubberOf,
} from '#verification/infrastructure/mutation/tool-text';

const ERROR = /\bERROR\b/u;

let folder: ProjectFolder;

beforeEach(() => {
  folder = createProjectFolder();
});

afterEach(() => {
  folder.remove();
});

describe('scrubberOf', () => {
  it('should take out the working copy by both of its paths', () => {
    const scrub = scrubberOf(folder.root);
    const real = realpathSync(folder.root);

    expect(scrub(`at ${folder.root}/a.ts and ${real}/b.ts`)).toBe(
      'at ./a.ts and ./b.ts',
    );
  });

  it('should take out the codes of a terminal', () => {
    const escape = String.fromCharCode(0x1b);

    expect(scrubberOf(folder.root)(`${escape}[1m${escape}[31mred`)).toBe('red');
  });

  describe('when one path of the copy holds the other', () => {
    it('should take out the longer first', () => {
      const linked = join(folder.root, 'copy');
      const target = join(folder.root, 'deep', linked);
      mkdirSync(target, { recursive: true });
      symlinkSync(target, linked);
      const real = realpathSync(target);

      const scrub = scrubberOf(linked);

      expect(real).toContain(linked);
      expect(scrub(`${linked}/x ${real}/y`)).toBe('./x ./y');
    });
  });
});

describe('capped', () => {
  it('should keep a text that fits and cut one that does not', () => {
    expect(capped('four', 4)).toBe('four');
    expect(capped('five!', 4)).toBe('five…');
  });
});

describe('detailOf', () => {
  it('should add the first line the marker finds', () => {
    const output = 'INFO started\n  ERROR first  \nERROR second\nlast\n';

    expect(detailOf('It failed:', output, ERROR)).toBe(
      'It failed: ERROR first',
    );
  });

  it('should add the last line with text when the marker finds none', () => {
    expect(detailOf('It failed:', 'one\ntwo\r\n\n', ERROR)).toBe(
      'It failed: two',
    );
  });

  it('should be the summary alone for an empty output', () => {
    expect(detailOf('It failed.', '\n \n', ERROR)).toBe('It failed.');
  });

  it('should stay short whatever the output is', () => {
    const detail = detailOf('It failed:', `ERROR ${'x'.repeat(5_000)}`, ERROR);

    expect(detail).toHaveLength(301);
  });
});
