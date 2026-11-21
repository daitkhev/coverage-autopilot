-- A job can be told not to start before a moment. An improvement that
-- waits for a window of a subscription leaves such a job behind, so it
-- goes on by itself when the window opens and no timer has to outlive a
-- restart of the service.
--
-- Empty for a job that may start at once.

ALTER TABLE jobs ADD COLUMN not_before TEXT;
