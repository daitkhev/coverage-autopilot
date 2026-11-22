import { describe, expect, it } from 'vitest';

import { loadWith, PLAIN_MACHINE } from '#tests/support/service-variables';

describe('loadServiceConfig', () => {
  describe('when it starts a program of the host', () => {
    it('should start the engine with the variables it needs and no other', () => {
      const config = loadWith({
        DOCKER_HOST: 'unix:///run/user/1000/docker.sock',
        XDG_RUNTIME_DIR: '/run/user/1000',
        GH_TOKEN: 'zz-private',
        NODE_OPTIONS: '--require /tmp/hook.js',
        AUTOPILOT_LOG_LEVEL: 'warn',
      });

      expect(config.sandbox.engine.environment).toEqual({
        ...PLAIN_MACHINE,
        DOCKER_HOST: 'unix:///run/user/1000/docker.sock',
        XDG_RUNTIME_DIR: '/run/user/1000',
      });
    });

    it('should start git with its path, its home and who commits, and no other', () => {
      const config = loadWith({
        GIT_AUTHOR_NAME: 'Someone Else',
        GIT_CONFIG_GLOBAL: '/tmp/gitconfig',
        GH_TOKEN: 'zz-private',
        SSH_AUTH_SOCK: '/tmp/agent.sock',
      });

      expect(Object.keys(config.git.environment).sort()).toEqual([
        'GIT_AUTHOR_EMAIL',
        'GIT_AUTHOR_NAME',
        'GIT_COMMITTER_EMAIL',
        'GIT_COMMITTER_NAME',
        'HOME',
        'PATH',
      ]);
      expect(config.git.environment['GIT_AUTHOR_NAME']).toBe(
        'Coverage Autopilot',
      );
    });

    it('should start gh with what finds its login, and no other', () => {
      const config = loadWith({
        GH_TOKEN: 'zz-private',
        GH_HOST: 'github.example.com',
        GH_CONFIG_DIR: '/home/dev/.gh',
        DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/501/bus',
        CLAUDE_CODE_OAUTH_TOKEN: 'zz-private-two',
        GIT_CONFIG_GLOBAL: '/tmp/gitconfig',
      });

      expect(config.gh.environment).toEqual({
        ...PLAIN_MACHINE,
        GH_TOKEN: 'zz-private',
        GH_HOST: 'github.example.com',
        GH_CONFIG_DIR: '/home/dev/.gh',
        DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/501/bus',
      });
    });
  });
});
