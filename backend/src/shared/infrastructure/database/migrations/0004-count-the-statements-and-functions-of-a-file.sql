-- A file is measured by four counters, and only lines and branches had
-- columns. The statements and the functions travelled in the document of
-- the uncovered code, where no query could read them.
--
-- Each counter gets its column. A document written before this keeps
-- them, so they are moved to the columns and taken out of the document,
-- which from now on holds the uncovered code alone.

ALTER TABLE file_coverages
  ADD COLUMN statements_covered INTEGER NOT NULL DEFAULT 0;

ALTER TABLE file_coverages
  ADD COLUMN statements_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE file_coverages
  ADD COLUMN functions_covered INTEGER NOT NULL DEFAULT 0;

ALTER TABLE file_coverages
  ADD COLUMN functions_total INTEGER NOT NULL DEFAULT 0;

UPDATE file_coverages
SET
  statements_covered =
    coalesce(json_extract(uncovered, '$.statements.covered'), 0),
  statements_total =
    coalesce(json_extract(uncovered, '$.statements.total'), 0),
  functions_covered =
    coalesce(json_extract(uncovered, '$.functions.covered'), 0),
  functions_total =
    coalesce(json_extract(uncovered, '$.functions.total'), 0),
  uncovered = json_remove(uncovered, '$.statements', '$.functions');
