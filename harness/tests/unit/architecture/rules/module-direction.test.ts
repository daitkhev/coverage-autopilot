import { describe, expect, it } from '@jest/globals';

import { moduleDirection } from '#harness/architecture/rules/module-direction';
import { backendOf, MODULES } from '#harness/tests/support/policy-builder';
import {
  importTo,
  projectOf,
  sourceFile,
} from '#harness/tests/support/project-builder';

const rule = moduleDirection(backendOf());

function detailsFor(from: string, to: string): string[] {
  return rule
    .check(projectOf(sourceFile(from, [importTo(to)])))
    .map((finding) => finding.detail);
}

describe('moduleDirection', () => {
  it('should report a module that uses one it may not', () => {
    const project = projectOf(
      sourceFile(`${MODULES}/store/application/find.ts`, [
        importTo(`${MODULES}/reports/contracts/report.dto.ts`, 6),
      ]),
    );

    expect(rule.check(project)).toEqual([
      {
        rule: 'module-direction',
        path: `${MODULES}/store/application/find.ts`,
        line: 6,
        detail: 'store may not use reports.',
      },
    ]);
  });

  it('should report it for the module files too', () => {
    expect(
      detailsFor(
        `${MODULES}/reports/reports.module.ts`,
        `${MODULES}/runs/runs.module.ts`,
      ),
    ).toEqual(['reports may not use runs.']);
  });

  it('should pass a module that uses one from its list', () => {
    expect(
      detailsFor(
        `${MODULES}/runs/application/start.ts`,
        `${MODULES}/store/contracts/item.dto.ts`,
      ),
    ).toEqual([]);
  });

  it('should pass imports inside one module', () => {
    expect(
      detailsFor(
        `${MODULES}/store/application/find.ts`,
        `${MODULES}/store/domain/item.ts`,
      ),
    ).toEqual([]);
  });

  it('should leave an unknown module to another rule', () => {
    expect(
      detailsFor(
        `${MODULES}/store/application/find.ts`,
        `${MODULES}/billing/contracts/invoice.dto.ts`,
      ),
    ).toEqual([]);
    expect(
      detailsFor(
        `${MODULES}/billing/application/find.ts`,
        `${MODULES}/store/contracts/item.dto.ts`,
      ),
    ).toEqual([]);
  });

  it('should leave files outside the modules alone', () => {
    expect(
      detailsFor('backend/src/main.ts', `${MODULES}/runs/runs.module.ts`),
    ).toEqual([]);
  });
});
