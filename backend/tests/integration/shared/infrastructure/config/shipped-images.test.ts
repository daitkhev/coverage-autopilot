import { describe, expect, it } from 'vitest';

import { withShippedBuilds } from '#infrastructure/config/shipped-images';
import { loadWith } from '#tests/support/service-variables';

const FILES = {
  sandbox: '/opt/autopilot/bin/shared/infrastructure/sandbox/s.Dockerfile',
  generator: '/opt/autopilot/bin/shared/infrastructure/sandbox/g.Dockerfile',
};

const SANDBOX_IMAGE = 'coverage-autopilot-sandbox:26';
const GENERATOR_IMAGE = 'coverage-autopilot-generator:2.1.329';

describe('withShippedBuilds', () => {
  it('should build the default image of each sandbox from its own file', () => {
    const config = loadWith({});

    const served = withShippedBuilds(config, FILES);

    expect(served).toEqual({
      ...config,
      sandbox: { ...config.sandbox, build: { file: FILES.sandbox } },
      generator: {
        ...config.generator,
        sandbox: {
          ...config.generator.sandbox,
          build: { file: FILES.generator },
        },
      },
    });
  });

  it('should build them as well when a person names the default images', () => {
    const config = loadWith({
      AUTOPILOT_SANDBOX_IMAGE: SANDBOX_IMAGE,
      AUTOPILOT_GENERATOR_IMAGE: GENERATOR_IMAGE,
    });

    const served = withShippedBuilds(config, FILES);

    expect(served.sandbox.build).toEqual({ file: FILES.sandbox });
    expect(served.generator.sandbox.build).toEqual({ file: FILES.generator });
  });

  describe('when a person names another image for the commands', () => {
    it('should build nothing for it, and still build the image of the generator', () => {
      const config = loadWith({ AUTOPILOT_SANDBOX_IMAGE: 'node:26-slim' });

      const served = withShippedBuilds(config, FILES);

      expect(served.sandbox).toEqual(config.sandbox);
      expect(served.sandbox).not.toHaveProperty('build');
      expect(served.generator.sandbox.build).toEqual({
        file: FILES.generator,
      });
    });
  });

  describe('when a person names another image for the generator', () => {
    it('should build nothing for it, and still build the image of the commands', () => {
      const config = loadWith({
        AUTOPILOT_GENERATOR_IMAGE: 'registry.local/generator:7',
      });

      const served = withShippedBuilds(config, FILES);

      expect(served.generator.sandbox).toEqual(config.generator.sandbox);
      expect(served.generator.sandbox).not.toHaveProperty('build');
      expect(served.sandbox.build).toEqual({ file: FILES.sandbox });
    });
  });

  describe('when the commands are to run in the default image of the generator', () => {
    it('should build it from the file of that image', () => {
      const config = loadWith({ AUTOPILOT_SANDBOX_IMAGE: GENERATOR_IMAGE });

      const served = withShippedBuilds(config, FILES);

      expect(served.sandbox.build).toEqual({ file: FILES.generator });
    });
  });
});
