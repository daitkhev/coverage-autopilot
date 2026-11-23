/** The line the gate prints before it starts a step. */
const HEADER = /^== (.+)/gm;

/** A run that printed no step: the gate itself did not start. */
const NO_STEP = 'check';

/** An agent is given this much of the output, counted from the end. */
const MOST_CHARACTERS = 8000;

/** The step a run of the gate stopped at, and what the step printed. */
export interface RedStep {
  readonly name: string;
  readonly output: string;
}

function endOf(text: string): string {
  const left = text.length - MOST_CHARACTERS;
  return left > 0
    ? `(the first ${String(left)} characters are left out)\n${text.slice(left)}`
    : text;
}

/**
 * Finds the red step in the output of a failed run. The gate stops at the
 * first red step, so the last header names it.
 */
export function redStepOf(output: string): RedStep {
  const header = [...output.matchAll(HEADER)].at(-1);
  if (header === undefined) {
    return { name: NO_STEP, output: endOf(output.trim()) };
  }
  const printed = output.slice(header.index + header[0].length);
  return { name: header[1] ?? NO_STEP, output: endOf(printed.trim()) };
}
