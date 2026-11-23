import { expect } from 'vitest';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';

import type { ServiceApi } from '#api/service-api';
import type { CommandIo } from '#commands/command-io';
import { type FakeSession, fakeSession } from '#tests/support/fake-service-api';

/** The io of a command over a fake session, which keeps what it was given. */
export interface RecordingIo extends CommandIo {
  readonly session: FakeSession;
  /** Every line of standard output, in order. */
  readonly printed: string[];
  /** Every line of standard error, in order. */
  readonly said: string[];
  /** Every pause of `--wait`, in milliseconds. */
  readonly pauses: number[];
}

/** How the command writes: `--json`, and whether the terminal shows Unicode. */
export type IoSettings = Partial<Pick<CommandIo, 'json' | 'unicode'>>;

/**
 * The io the entry file would hand a command, over a session that answers
 * as the test scripted. A pause returns at once, so a wait runs through.
 */
export function recordingIo(
  scripted: Partial<ServiceApi>,
  settings: IoSettings = {},
): RecordingIo {
  const printed: string[] = [];
  const said: string[] = [];
  const pauses: number[] = [];
  return {
    session: fakeSession(scripted),
    out: (line) => {
      printed.push(line);
    },
    err: (line) => {
      said.push(line);
    },
    pause: (ms) => {
      pauses.push(ms);
      return Promise.resolve();
    },
    json: false,
    unicode: true,
    ...settings,
    printed,
    said,
    pauses,
  };
}

/** A method of the fake that answers in turn and then keeps its last answer. */
export function inTurn<Answer>(
  first: Answer,
  ...rest: readonly Answer[]
): () => Promise<Answer> {
  const answers = [first, ...rest];
  let calls = 0;
  return () => {
    const answer = answers[Math.min(calls, answers.length - 1)] ?? first;
    calls += 1;
    return Promise.resolve(answer);
  };
}

/** The refusal of a route for an id it does not know. */
export const NOT_FOUND: ErrorBody = {
  error: 'not_found',
  message: 'Nothing has this id.',
};

/**
 * The command printed no result and said the refusal on standard error,
 * in the shape the service uses.
 */
export function expectRefusal(io: RecordingIo, error: ErrorBody): void {
  expect(io.printed).toEqual([]);
  expect(io.said).toEqual([JSON.stringify(error)]);
}
