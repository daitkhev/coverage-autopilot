import { z } from 'zod';

const ID_MAX_LENGTH = 64;
const PATH_MAX_LENGTH = 1024;
const TEXT_MAX_LENGTH = 8192;
const PERCENTAGE_MAX = 100;
const MILLISECOND_DIGITS = 3;

/** A SHA-1 or a SHA-256 object name, as `git` prints it. */
const COMMIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** Relative to the root of the repository, and never leaving it. */
const REPOSITORY_PATH = /^(?!\/)(?!(?:.*\/)?\.\.(?:\/|$)).+$/;

/** A SHA-256 digest in hex, which is how a test patch is named. */
const PATCH_HASH = /^[0-9a-f]{64}$/;

export const idSchema = z.string().min(1).max(ID_MAX_LENGTH);

/**
 * One format for every moment, `YYYY-MM-DDTHH:mm:ss.sssZ`: always UTC and
 * always with milliseconds, so two moments compare as text. The client
 * shows a moment in the time zone of its user.
 */
export const timestampSchema = z.iso.datetime({
  precision: MILLISECOND_DIGITS,
});

export const commitShaSchema = z.string().regex(COMMIT_SHA);

export const filePathSchema = z
  .string()
  .max(PATH_MAX_LENGTH)
  .regex(REPOSITORY_PATH);

export const patchHashSchema = z.string().regex(PATCH_HASH);

export const percentageSchema = z.number().min(0).max(PERCENTAGE_MAX);

export const countSchema = z.int().nonnegative();

export const ordinalSchema = z.int().positive();

export const textSchema = z.string().min(1).max(TEXT_MAX_LENGTH);

/** The `:id` of every route that names one resource. */
export const resourceParamsSchema = z.strictObject({ id: idSchema });

export type ResourceParams = z.infer<typeof resourceParamsSchema>;

/**
 * The body of a command that the path says everything about: starting a
 * scan and cancelling one or an improvement. Strict, so a stray field is
 * refused rather than silently ignored.
 */
export const emptyBodySchema = z.strictObject({});

export type EmptyBody = z.infer<typeof emptyBodySchema>;
