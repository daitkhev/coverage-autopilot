/**
 * The script of every tool the gate starts, from the root of the
 * repository. A tool is started by its path, never through a script of
 * `package.json`, so no change of that file can swap what runs.
 */
export const TOOLS = {
  eslint: 'node_modules/eslint/bin/eslint.js',
  jest: 'node_modules/jest/bin/jest.js',
  jscpd: 'node_modules/jscpd/run-jscpd.js',
  knip: 'node_modules/knip/bin/knip.js',
  'markdownlint-cli2':
    'node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs',
  prettier: 'node_modules/prettier/bin/prettier.cjs',
  typescript: 'node_modules/typescript/bin/tsc',
} as const;

/** Jest loads ES modules through a mode Node still calls experimental. */
export const JEST_NODE_OPTIONS = [
  '--experimental-vm-modules',
  '--disable-warning=ExperimentalWarning',
];

export const JEST_CONFIG = 'harness/configs/jest.json';
