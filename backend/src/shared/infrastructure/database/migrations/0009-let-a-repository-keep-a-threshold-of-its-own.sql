-- One threshold for every repository left a repository that is well
-- covered with nothing to improve. A person can now give a repository a
-- percent of its own, and take it back.
--
-- Empty for a repository judged by the default of the service. A whole
-- percent from 1 to 100, since 0 would make no file a target.

ALTER TABLE repositories ADD COLUMN threshold_percentage INTEGER
  CHECK (threshold_percentage BETWEEN 1 AND 100);
