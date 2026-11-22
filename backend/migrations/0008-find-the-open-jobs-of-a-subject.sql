-- The answer for a repository names its scan that has not ended, and a
-- cancel ends every open job of its subject. Both ask by the subject, and
-- no index served that: each read every job the service ever kept.
--
-- Only an open job is in the index, so it stays as small as the queue.

CREATE INDEX jobs_open_by_subject
  ON jobs (subject_id)
  WHERE status IN ('pending', 'leased');
