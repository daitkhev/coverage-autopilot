-- No code of a repository runs while its packages are installed, which
-- refused a repository of its own owner that takes a package from git. A
-- person can now trust a repository, so it is installed as its own
-- developers install it, or keep it sandboxed whatever the default says.
--
-- Empty for a repository installed as the default of the service says.

ALTER TABLE repositories ADD COLUMN install_mode TEXT
  CHECK (install_mode IN ('sandboxed', 'trusted'));
