import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { parseAs } from '@coverage-autopilot/api-contracts/parsing';

import type { ServiceAnswer } from '#api/service-api';

/** What came back over the socket: the status and the body as text. */
export interface SocketReply {
  readonly status: number;
  readonly text: string;
}

/** A schema of the contracts, as the one reader of the client takes it. */
export type ContractSchema = Parameters<typeof parseAs>[0];

/** The value a schema of the contracts reads. */
export type ValueOf<Schema extends ContractSchema> = ReturnType<
  typeof parseAs<Schema>
>;

/** From this status on, an answer is a refusal with the error body. */
const FIRST_REFUSAL = 400;

/**
 * The body read as JSON. A body that is not JSON has no value, which every
 * schema refuses, so it is a mismatch like any other answer of a wrong
 * shape.
 */
export function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The body as the schema reads it, whatever the status. */
export function valueOf<Schema extends ContractSchema>(
  schema: Schema,
  reply: SocketReply,
): ValueOf<Schema> {
  return parseAs(schema, jsonOf(reply.text));
}

/**
 * The value of the route below 400, and the error of the contract from
 * 400 on. A body that is not what its status says is a mismatch.
 */
export function answerOf<Schema extends ContractSchema>(
  schema: Schema,
  reply: SocketReply,
): ServiceAnswer<ValueOf<Schema>> {
  const { status } = reply;
  return status < FIRST_REFUSAL
    ? { outcome: 'answered', status, value: valueOf(schema, reply) }
    : { outcome: 'refused', status, error: valueOf(errorSchema, reply) };
}
