-- A scan shows when it started, and a job kept only when it was queued
-- and when it last changed. The first claim of a job sets the moment and
-- a later claim keeps it, so a job that went back to the queue started
-- when a worker first took it.
--
-- Empty for a job that no worker has claimed yet. A job claimed before
-- this has no such moment either, because nothing kept it.

ALTER TABLE jobs ADD COLUMN started_at TEXT;
