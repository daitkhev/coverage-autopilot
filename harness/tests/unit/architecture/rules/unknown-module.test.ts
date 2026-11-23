import { describe, expect, it } from 'vitest';

import type { Rule } from '#harness/architecture/project';
import { unknownModule } from '#harness/architecture/rules/unknown-module';
import { backendOf, MODULES } from '#harness/tests/support/policy-builder';
import { projectOf, sourceFile } from '#harness/tests/support/project-builder';

const rule = (): Rule => unknownModule(backendOf());

describe('unknownModule', () => {
  it('should report a file of a module the policy does not list', () => {
    const path = `${MODULES}/billing/domain/invoice.ts`;

    expect(rule().check(projectOf(sourceFile(path)))).toEqual([
      {
        rule: 'unknown-module',
        path,
        line: 1,
        detail:
          '"billing" is not a module. The modules are: store, reports, runs.',
      },
    ]);
  });

  it('should report the module file of an unknown module', () => {
    const project = projectOf(
      sourceFile(`${MODULES}/billing/billing.module.ts`),
    );

    expect(rule().check(project)).toHaveLength(1);
  });

  it('should pass the modules the policy lists', () => {
    const project = projectOf(
      sourceFile(`${MODULES}/store/domain/entities/item.entity.ts`),
      sourceFile(`${MODULES}/runs/runs.module.ts`),
    );

    expect(rule().check(project)).toEqual([]);
  });

  it('should leave files outside the modules alone', () => {
    const project = projectOf(
      sourceFile('backend/src/main.ts'),
      sourceFile('backend/src/shared/kernel/result.ts'),
      sourceFile('backend/tests/unit/billing/invoice.test.ts'),
      sourceFile('frontend/src/modules/billing/view.tsx'),
    );

    expect(rule().check(project)).toEqual([]);
  });
});
