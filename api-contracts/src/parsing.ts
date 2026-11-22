import type { z } from 'zod';

/** The place of one mismatch and the name of the rule it broke. */
export interface ContractIssue {
  /** Such as `budget.attempts`, and empty for the value as a whole. */
  readonly path: string;
  readonly code: string;
}

const AT_THE_ROOT = 'the value';

function described(issue: ContractIssue): string {
  return `${issue.path === '' ? AT_THE_ROOT : issue.path}: ${issue.code}`;
}

/**
 * A value that crossed the socket did not match its schema. It names where
 * and which rule, and never the value: a request may carry a secret, and
 * the message goes into an answer and into a log.
 */
export class ContractMismatchError extends Error {
  public readonly issues: readonly ContractIssue[];

  public constructor(issues: readonly ContractIssue[]) {
    super(`It does not match its schema. ${issues.map(described).join(', ')}.`);
    this.name = 'ContractMismatchError';
    this.issues = issues;
  }
}

/**
 * The value as its schema reads it. The service reads a request with it
 * and the client an answer, so both refuse a mismatch in the same words.
 */
export function parseAs<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  throw new ContractMismatchError(
    parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      code: issue.code,
    })),
  );
}
