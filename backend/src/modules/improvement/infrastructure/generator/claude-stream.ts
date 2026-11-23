import type { z } from 'zod';

import {
  answerEventSchema,
  envelopeSchema,
  type InitEvent,
  initEventSchema,
  rateLimitEventSchema,
  type RateLimitInfo,
  type ResultEvent,
  resultEventSchema,
} from '#improvement/infrastructure/generator/claude-stream.schema';
import type { SandboxCommandResult } from '#ports/sandbox.port';

const LINE_BREAK = '\n';
const SYSTEM = 'system';

/** What the sandbox gave back of what the CLI printed, and how it ended. */
type SandboxOutput = Pick<
  SandboxCommandResult,
  'outcome' | 'output' | 'outputTruncated'
>;

/** The output of one run of the CLI, as far as the adapter reads it. */
export interface CliStream {
  /** Every start report, so a second start with other tools is seen. */
  readonly inits: readonly InitEvent[];
  /** The last state of the usage limits: the CLI repeats it. */
  readonly rateLimit: RateLimitInfo | null;
  readonly result: ResultEvent | null;
  /** The errors the CLI gave its answers, such as `authentication_failed`. */
  readonly answerErrors: ReadonlySet<string>;
  /** The events the adapter relies on that came in another shape. */
  readonly unreadable: readonly string[];
  /**
   * The lines that are no event: the error stream of the CLI. They are
   * kept whole, so the credential is hidden before any part is cut off.
   */
  readonly plainText: string;
}

interface Collected {
  readonly inits: InitEvent[];
  rateLimit: RateLimitInfo | null;
  result: ResultEvent | null;
  readonly answerErrors: Set<string>;
  readonly unreadable: string[];
  readonly plain: string[];
}

type Taker = (collected: Collected, json: unknown) => void;

/**
 * An event the adapter relies on: one in another shape is recorded as
 * unreadable, never passed over, so a change of the CLI is a fault and not
 * a wrong outcome.
 */
function strictly<Event>(
  kind: string,
  schema: z.ZodType<Event>,
  keep: (collected: Collected, event: Event) => void,
): [string, Taker] {
  const taker: Taker = (collected, json) => {
    const parsed = schema.safeParse(json);
    if (parsed.success) {
      keep(collected, parsed.data);
    } else {
      collected.unreadable.push(kind);
    }
  };
  return [kind, taker];
}

/** An answer is read for its error alone, so its shape is not a problem. */
const takeAnswer: Taker = (collected, json) => {
  const error = answerEventSchema.safeParse(json).data?.error;
  if (typeof error === 'string') {
    collected.answerErrors.add(error);
  }
};

const TAKERS: ReadonlyMap<string, Taker> = new Map([
  strictly('system:init', initEventSchema, (collected, init) => {
    collected.inits.push(init);
  }),
  strictly('rate_limit_event', rateLimitEventSchema, (collected, event) => {
    collected.rateLimit = event.rate_limit_info;
  }),
  strictly('result', resultEventSchema, (collected, result) => {
    collected.result = result;
  }),
  ['assistant', takeAnswer],
]);

function jsonOf(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/** A system event is known by its subtype as well. */
function kindOf(type: string, subtype: unknown): string {
  return type === SYSTEM && typeof subtype === 'string'
    ? `${type}:${subtype}`
    : type;
}

function take(collected: Collected, line: string): void {
  const json = jsonOf(line);
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    collected.plain.push(line);
    return;
  }
  const { type, subtype } = envelope.data;
  TAKERS.get(kindOf(type, subtype))?.(collected, json);
}

function afterFirstBreak(text: string): string {
  const cut = text.indexOf(LINE_BREAK);
  return cut === -1 ? '' : text.slice(cut + 1);
}

function throughLastBreak(text: string): string {
  return text.slice(0, text.lastIndexOf(LINE_BREAK) + 1);
}

/**
 * The whole lines of the output. When the sandbox kept only its end, the
 * first line may be the end of a longer one, and a command stopped at its
 * time limit may have ended inside its last line. Such a part of a line
 * is neither read as an event nor kept, since it may begin or end inside
 * the credential, where no search finds it.
 */
export function wholeLinesOf(ended: SandboxOutput): string {
  const head = ended.outputTruncated
    ? afterFirstBreak(ended.output)
    : ended.output;
  return ended.outcome === 'timed_out' ? throughLastBreak(head) : head;
}

/**
 * Reads the output of `--output-format stream-json --verbose`. Both
 * streams of the CLI come mixed, so a line that is not an event is kept as
 * text. An event of a type the adapter does not know is passed over, and
 * so is every field it does not read.
 */
export function readStream(ended: SandboxOutput): CliStream {
  const collected: Collected = {
    inits: [],
    rateLimit: null,
    result: null,
    answerErrors: new Set(),
    unreadable: [],
    plain: [],
  };
  const lines = wholeLinesOf(ended)
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  for (const line of lines) {
    take(collected, line);
  }
  const { plain, ...events } = collected;
  return { ...events, plainText: plain.join(LINE_BREAK) };
}
