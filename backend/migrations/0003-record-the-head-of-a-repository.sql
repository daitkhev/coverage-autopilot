-- The access check reads the head of the default branch. A repository
-- whose head is not the commit of its latest snapshot is outdated, and
-- that costs no call to GitHub when the list is drawn.
--
-- Both columns are empty until the first check that got that far.

ALTER TABLE repositories ADD COLUMN head_commit TEXT;

ALTER TABLE repositories ADD COLUMN head_checked_at TEXT
  CHECK ((head_commit IS NULL) = (head_checked_at IS NULL));
