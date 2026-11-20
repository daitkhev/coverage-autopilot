import { describe, expect, it } from '@jest/globals';

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
      'unit',
      'integration',
    ]);
  });

  it('should run one step by its name', () => {
    expect(namesOf('lint')).toEqual(['lint']);
  });

  describe('when the name is unknown', () => {
    it('should throw HarnessError that lists what is known', () => {
      expect(() => planFor('everything')).toThrow(HarnessError);
      expect(() => planFor('everything')).toThrow(/Known: fast, full, format/);
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
    expect(configured['types']).toContain('--project tsconfig.json');
    expect(configured['unit']).toContain('--config harness/configs/jest.json');
  });

  it('should fail lint on a warning', () => {
    const lint = planFor('lint')[0];

    expect(lint?.arguments.join(' ')).toContain('--max-warnings 0');
  });

  it('should keep the gate from writing a kept frame', () => {
    expect(planFor('unit')[0]?.arguments).toContain('--ci');
    expect(planFor('integration')[0]?.arguments).toContain('--ci');
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
