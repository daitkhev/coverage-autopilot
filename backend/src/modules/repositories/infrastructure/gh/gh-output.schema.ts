import { z } from 'zod';

import {
  NOT_A_REPOSITORY_URL,
  RepositoryUrl,
} from '#repositories/domain/value-objects/repository-url.vo';

/** The address `gh pr create` prints for the pull request it opened. */
const PULL_REQUEST_URL = /^https:\/\/[^/\s]+\/[^/\s]+\/[^/\s]+\/pull\/\d+$/u;

const LINE_BREAK = '\n';
const SLASH = '/';

function lastLineOf(text: string): string {
  const trimmed = text.trim();
  return trimmed.slice(trimmed.lastIndexOf(LINE_BREAK) + 1);
}

const jsonText = z.string().transform((text, context): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    context.addIssue({ code: 'custom', message: 'The text is not JSON.' });
    return z.NEVER;
  }
});

const pullRequestSchema = z.object({
  number: z.int().positive(),
  url: z.url({ protocol: /^https$/u }),
});

/** `gh api repos/<owner>/<name>`, of which only the right to push counts. */
export const repositoryPermissionsSchema = jsonText.pipe(
  z.object({ permissions: z.object({ push: z.boolean() }) }),
);

/** `gh api user`: the account, of which only its login counts. */
export const accountSchema = jsonText.pipe(
  z.object({ login: z.string().min(1) }),
);

/** An address the host printed, taken only as the value object reads it. */
const repositoryUrlText = z.string().transform((text, context) => {
  const url = RepositoryUrl.read(text);
  if (url === null) {
    context.addIssue({ code: 'custom', message: NOT_A_REPOSITORY_URL });
    return z.NEVER;
  }
  return url;
});

/**
 * `gh api --method=POST repos/<owner>/<name>/forks`: the fork the account
 * has, new or not, of which the address git reaches it at counts.
 */
export const forkSchema = jsonText.pipe(
  z.object({ fork: z.literal(true), clone_url: repositoryUrlText }),
);

/** `gh pr list --json number,url`: the pull requests, newest first. */
export const pullRequestListSchema = jsonText.pipe(z.array(pullRequestSchema));

/** `gh pr create`: the address of the new pull request on its last line. */
export const createdPullRequestSchema = z
  .string()
  .transform(lastLineOf)
  .pipe(z.string().regex(PULL_REQUEST_URL))
  .transform((url) => ({
    number: Number(url.slice(url.lastIndexOf(SLASH) + 1)),
    url,
  }))
  .pipe(pullRequestSchema);
