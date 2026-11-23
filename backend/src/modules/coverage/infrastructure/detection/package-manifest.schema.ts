import { z } from 'zod';

const versions = z.record(z.string(), z.string());

/** The fields of `package.json` the detection reads. Others are kept. */
export const packageManifestSchema = z.looseObject({
  dependencies: versions.optional(),
  devDependencies: versions.optional(),
  scripts: versions.optional(),
  workspaces: z.unknown().optional(),
  packageManager: z.string().optional(),
  jest: z.unknown().optional(),
});

export type PackageManifest = z.infer<typeof packageManifestSchema>;

/**
 * The fields of `package-lock.json` the detection reads. The lockfile of
 * npm 7 and later lists every installed package under its folder.
 */
export const packageLockSchema = z.looseObject({
  packages: z
    .record(z.string(), z.looseObject({ version: z.string().optional() }))
    .optional(),
});
