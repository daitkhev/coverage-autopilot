/**
 * How the packages of a repository are installed. `sandboxed`: no code of
 * the repository or of its packages runs while the network is open.
 * `trusted`: as its own developers install it, with the scripts of its
 * packages, its own manager and its hooks.
 */
export const INSTALL_MODES = ['sandboxed', 'trusted'] as const;

export type InstallMode = (typeof INSTALL_MODES)[number];
