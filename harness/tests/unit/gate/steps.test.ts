import { describe, expect, it } from 'vitest';

import { planFor, PROFILES, STEPS } from '#harness/gate/steps';
import { HarnessError } from '#harness/shared/harness.error';

function namesOf(name: string): string[] {
  return planFor(name).map((step) => step.name);
}

describe('planFor', () => {
  it('should run format, lint, types and architecture for fast', () => {
    expect(namesOf('fast')).toEqual([
      'format',
      'lint',
      'types',
      'architecture',
    ]);
  });

  it('should run everything fast runs and the tests for full', () => {
    expect(namesOf('full')).toEqual([
      'format',
      'lint',
      'types',
      'architecture',
      'compare',
      'unused',
      'duplication',
      'build',
      'unit',
      'integration',
      'e2e',
      'coverage',
      'documents',
      'secrets',
    ]);
  });

  it('should run everything full runs, then the slow steps for ci', () => {
    expect(namesOf('ci')).toEqual([
      ...namesOf('full'),
      'workflows',
      'runners',
      'stress',
      'mutation',
    ]);
  });

  it('should run one step by its name', () => {
    expect(namesOf('lint')).toEqual(['lint']);
  });

  describe('when the name is unknown', () => {
    it('should throw HarnessError that lists what is known', () => {
      expect(() => planFor('everything')).toThrow(HarnessError);
      expect(() => planFor('everything')).toThrow(
        /Known: fast, full, ci, format/,
      );
    });

    it('should not take a property of every object for a profile', () => {
      expect(() => planFor('toString')).toThrow(HarnessError);
    });
  });
});

describe('STEPS', () => {
  it('should give every tool the path of its configuration', () => {
    const configured = Object.fromEntries(
      STEPS.map((step) => [step.name, step.arguments.join(' ')]),
    );

    expect(configured['format']).toContain('--config prettier.config.mjs');
    expect(configured['lint']).toContain('--config eslint.config.mjs');
    expect(configured['unit']).toContain('--config vitest.config.mjs');
    expect(configured['runners']).toContain(
      '--config vitest.runners.config.mjs',
    );
  });

  it.each(['unit', 'integration'])(
    'should run the %s tests of the harness and of every workspace',
    (kind) => {
      expect(planFor(kind)[0]?.arguments.slice(-4)).toEqual([
        `harness/tests/${kind}`,
        `api-contracts/tests/${kind}`,
        `backend/tests/${kind}`,
        `frontend/tests/${kind}`,
      ]);
    },
  );

  it('should compare a tree on a desk with the commit it stands on', () => {
    expect(planFor('compare')[0]?.arguments).toEqual(['--compare', 'HEAD']);
  });

  it('should give Knip its configuration and hide nothing but aliases', () => {
    const unused = planFor('unused')[0]?.arguments.join(' ');

    expect(unused).toContain('--config harness/configs/knip.json');
    expect(unused).toContain('--exclude subpaths');
    expect(unused?.match(/--exclude/g)).toHaveLength(1);
  });

  it('should leave the ceiling of duplication to its own command', () => {
    expect(planFor('duplication')[0]).toEqual({
      name: 'duplication',
      nodeOptions: [],
      script: 'harness/bin/duplication.ts',
      arguments: [],
    });
  });

  it('should fail lint on a warning', () => {
    const lint = planFor('lint')[0];

    expect(lint?.arguments.join(' ')).toContain('--max-warnings 0');
  });

  it('should keep the gate from writing a kept frame', () => {
    for (const name of ['unit', 'integration', 'runners']) {
      expect(planFor(name)[0]?.arguments).toContain('--update=none');
    }
  });

  it('should have no step that a profile never runs', () => {
    const used = new Set(Object.values(PROFILES).flat());

    expect(STEPS.map((step) => step.name).filter((n) => !used.has(n))).toEqual(
      [],
    );
  });

  it('should start a tool by a path, never by a script of the package', () => {
    for (const step of STEPS) {
      expect(step.script).toMatch(/^(node_modules|harness)\//);
    }
  });
});
