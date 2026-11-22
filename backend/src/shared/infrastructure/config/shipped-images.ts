import type { ServiceConfig } from '#infrastructure/config/service-config';
import { VARIABLES } from '#infrastructure/config/service-environment.schema';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';

/**
 * The files the service ships to build its own images from, as absolute
 * paths the entry file finds from its own place.
 */
export interface ShippedImageFiles {
  /** The image the commands of a repository run in. */
  readonly sandbox: string;
  /** The image the generator runs in. */
  readonly generator: string;
}

/** Each image the service makes, by its default name, and its file. */
type ShippedBuilds = ReadonlyMap<string, string>;

function shippedBuildsOf(files: ShippedImageFiles): ShippedBuilds {
  return new Map([
    [VARIABLES.AUTOPILOT_SANDBOX_IMAGE.fallback, files.sandbox],
    [VARIABLES.AUTOPILOT_GENERATOR_IMAGE.fallback, files.generator],
  ]);
}

/**
 * The sandbox with the build of its image when it names an image the
 * service makes: no registry has that image, so the service builds it from
 * the file it ships. A person who names another image gets that image as
 * the engine has it or pulls it.
 */
function withShippedBuild(
  sandbox: SandboxSettings,
  builds: ShippedBuilds,
): SandboxSettings {
  const file = builds.get(sandbox.image);
  return file === undefined ? sandbox : { ...sandbox, build: { file } };
}

/**
 * The configuration the service serves with: each of its two sandboxes
 * with the build of its image, when the image is one the service makes.
 */
export function withShippedBuilds(
  config: ServiceConfig,
  files: ShippedImageFiles,
): ServiceConfig {
  const builds = shippedBuildsOf(files);
  const { generator } = config;
  return {
    ...config,
    sandbox: withShippedBuild(config.sandbox, builds),
    generator: {
      ...generator,
      sandbox: withShippedBuild(generator.sandbox, builds),
    },
  };
}
