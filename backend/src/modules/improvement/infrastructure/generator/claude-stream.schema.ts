import { z } from 'zod';

/** The last second an `Instant` holds, at the end of the year 9999. */
const LAST_SECOND = 253_402_300_799;

const epochSeconds = z.number().nonnegative().max(LAST_SECOND);

/**
 * What every line of `--output-format stream-json` is: an object with a
 * type. A line that is not one is text the CLI wrote to its error stream.
 */
export const envelopeSchema = z.looseObject({
  type: z.string(),
  subtype: z.unknown().optional(),
});

/** `system` with the subtype `init`: what the CLI runs with. */
export const initEventSchema = z.looseObject({
  tools: z.array(z.string()),
  mcp_servers: z.array(z.unknown()),
  /** `none` under the login of a subscription. */
  apiKeySource: z.string(),
});

const usageWindowSchema = z.looseObject({
  /** The share used, from 0 to 1. */
  utilization: z.number().nonnegative(),
  resetsAt: epochSeconds,
});

/** `rate_limit_event`: the state of the usage limits of the account. */
export const rateLimitEventSchema = z.looseObject({
  rate_limit_info: z.looseObject({
    status: z.string(),
    /** The limit the status is about, such as `five_hour`. */
    rateLimitType: z.string().nullish(),
    resetsAt: epochSeconds.nullish(),
    unifiedWindows: z
      .looseObject({
        five_hour: usageWindowSchema.nullish(),
        seven_day: usageWindowSchema.nullish(),
      })
      .nullish(),
  }),
});

/** `assistant`: an answer, of which only the error the CLI gave it is read. */
export const answerEventSchema = z.looseObject({
  error: z.string().nullish(),
});

/**
 * A tool call the CLI refused. What the call aimed at is read where it is
 * found, since each tool names it in another field.
 */
const permissionDenialSchema = z.looseObject({
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()).catch({}),
});

/**
 * `result`: the last event, the only one with the real number of tokens.
 * The texts of a failure are read only to tell a failed login, and the
 * CLI does not put them in the same field each time, so a missing or
 * other one reads as no text.
 */
export const resultEventSchema = z.looseObject({
  subtype: z.string(),
  is_error: z.boolean(),
  usage: z.looseObject({
    input_tokens: z.int().nonnegative(),
    output_tokens: z.int().nonnegative(),
  }),
  permission_denials: z.array(permissionDenialSchema),
  result: z.string().catch(''),
  errors: z.array(z.string()).catch([]),
});

export type InitEvent = z.infer<typeof initEventSchema>;

export type RateLimitInfo = z.infer<
  typeof rateLimitEventSchema
>['rate_limit_info'];

export type ResultEvent = z.infer<typeof resultEventSchema>;
