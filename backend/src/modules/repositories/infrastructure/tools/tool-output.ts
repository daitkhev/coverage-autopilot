import type { z } from 'zod';

import { UnexpectedToolOutputError } from '#repositories/infrastructure/errors/unexpected-tool-output.error';

/**
 * Reads what a tool printed with its schema. Output that does not match
 * is a fault, and the message leaves the text out: it is the raw output,
 * which nothing has hidden secrets in.
 */
export function parseToolOutput<Output>(
  schema: z.ZodType<Output, string>,
  text: string,
  what: string,
): Output {
  const parsed = schema.safeParse(text);
  if (!parsed.success) {
    throw new UnexpectedToolOutputError(
      `${what} printed what the module cannot read.`,
    );
  }
  return parsed.data;
}
