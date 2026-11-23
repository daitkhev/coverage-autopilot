import { describe, expect, it } from 'vitest';

import { redStepOf } from '#harness/agents/red-step';

const MOST = 8000;

describe('redStepOf', () => {
  it('should name the last step that started, with what it printed', () => {
    const output =
      '\n== format\nAll files are fine\n\n== lint\n' +
      'a.ts: 1 problem\n\ncheck full: failed at lint\n';

    expect(redStepOf(output)).toEqual({
      name: 'lint',
      output: 'a.ts: 1 problem\n\ncheck full: failed at lint',
    });
  });

  it('should give the whole output of a gate that started no step', () => {
    expect(redStepOf('"ful" is not a profile or a step.\n')).toEqual({
      name: 'check',
      output: '"ful" is not a profile or a step.',
    });
  });

  it('should not take a line that only holds the mark for a step', () => {
    const output = '\n== unit\nexpected a == b\nand x\n== \n';

    expect(redStepOf(output)).toEqual({
      name: 'unit',
      output: 'expected a == b\nand x\n==',
    });
  });

  it('should keep an output of the greatest length whole', () => {
    const printed = 'x'.repeat(MOST);

    expect(redStepOf(`== unit\n${printed}`).output).toBe(printed);
  });

  it('should keep the end of an output that is longer', () => {
    const printed = `start${'x'.repeat(MOST - 1)}`;

    expect(redStepOf(`== unit\n${printed}`).output).toBe(
      `(the first 4 characters are left out)\nt${'x'.repeat(MOST - 1)}`,
    );
  });

  it('should keep the end of a long output of a gate that started no step', () => {
    const printed = `start${'x'.repeat(MOST)}`;

    expect(redStepOf(printed).output).toBe(
      `(the first 5 characters are left out)\n${'x'.repeat(MOST)}`,
    );
  });
});
