import { z } from 'zod';

const columns = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  url: z.string(),
  default_branch: z.string(),
  connected_at: z.string(),
});

/**
 * A row of `repositories` as SQLite gives it back. The head and the moment
 * it was read are both there or both empty, as the table checks.
 */
export const repositoryRowSchema = z.union([
  columns.extend({ head_commit: z.string(), head_checked_at: z.string() }),
  columns.extend({ head_commit: z.null(), head_checked_at: z.null() }),
]);

export type RepositoryRow = z.infer<typeof repositoryRowSchema>;
