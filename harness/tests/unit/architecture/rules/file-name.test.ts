import { describe, expect, it } from '@jest/globals';

import { fileName } from '#harness/architecture/rules/file-name';
import { projectOf, sourceFile } from '#harness/tests/support/project-builder';

const rule = fileName(['index', 'utils']);

function detailsFor(path: string): string[] {
  return rule.check(projectOf(sourceFile(path))).map((found) => found.detail);
}

describe('fileName', () => {
  it('should pass kebab-case names with role suffixes', () => {
    expect(detailsFor('src/domain/coverage-snapshot.entity.ts')).toEqual([]);
    expect(detailsFor('tests/unit/coverage-percentage.vo.test.ts')).toEqual([]);
    expect(detailsFor('eslint.config.mjs')).toEqual([]);
    expect(detailsFor('src/v2/sqlite3-reader.ts')).toEqual([]);
  });

  it('should report a file that is not kebab-case', () => {
    expect(detailsFor('src/coverageSnapshot.ts')).toEqual([
      '"coverageSnapshot" is not kebab-case.',
    ]);
    expect(detailsFor('src/coverage_snapshot.ts')).toEqual([
      '"coverage_snapshot" is not kebab-case.',
    ]);
  });

  it('should report a folder that is not kebab-case', () => {
    expect(detailsFor('src/valueObjects/a.ts')).toEqual([
      '"valueObjects" is not kebab-case.',
    ]);
  });

  it('should report a banned file name before anything else', () => {
    expect(detailsFor('src/index.ts')).toEqual([
      '"index" is not a name. Say what the code is for.',
    ]);
  });

  it('should report a banned folder name', () => {
    expect(detailsFor('src/utils/format-path.ts')).toEqual([
      '"utils" is not a name. Say what the code is for.',
    ]);
  });

  it('should not mistake a longer name for a banned one', () => {
    expect(detailsFor('src/index-reader.ts')).toEqual([]);
  });

  it('should give one finding for a file, on its first line', () => {
    const found = rule.check(projectOf(sourceFile('Src/Utils/index.ts')));

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'file-name', line: 1 });
  });
});
