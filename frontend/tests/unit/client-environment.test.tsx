import { describe, expect, it } from 'vitest';

import {
  serviceSettingOf,
  showsColour,
  showsUnicode,
} from '#client/client-environment';

const COMMAND = ['/usr/bin/node', '/opt/tool/bin/service.js'] as const;

describe('serviceSettingOf', () => {
  it('should find the instance under the home when no folder is named', () => {
    const setting = serviceSettingOf({ HOME: '/home/user' }, COMMAND);

    expect(setting.instance).toEqual({ home: '/home/user' });
    expect(setting.command).toBe(COMMAND);
  });

  it('should take the folder of the instance a variable names', () => {
    const setting = serviceSettingOf(
      { HOME: '/home/user', AUTOPILOT_INSTANCE_DIR: '/srv/autopilot' },
      COMMAND,
    );

    expect(setting.instance).toEqual({
      home: '/home/user',
      instanceDirectory: '/srv/autopilot',
    });
  });

  it('should hand a started service every variable that is set', () => {
    const setting = serviceSettingOf(
      { HOME: '/home/user', PATH: '/usr/bin', EMPTY: '', GONE: undefined },
      COMMAND,
    );

    expect(setting.variables).toEqual({
      HOME: '/home/user',
      PATH: '/usr/bin',
      EMPTY: '',
    });
  });

  it('should have no home when the process has none', () => {
    expect(serviceSettingOf({}, COMMAND).instance).toEqual({ home: '' });
  });

  it('should make a service of its own under a short folder', () => {
    expect(serviceSettingOf({}, COMMAND).temporaryRoot).toBe('/tmp');
  });
});

describe('showsColour', () => {
  it('should show colour unless NO_COLOR is set', () => {
    expect(showsColour({})).toBe(true);
  });

  it('should show none when NO_COLOR is set, whatever to', () => {
    expect(showsColour({ NO_COLOR: '' })).toBe(false);
    expect(showsColour({ NO_COLOR: '1' })).toBe(false);
  });
});

describe('showsUnicode', () => {
  it('should show Unicode in a locale that names UTF-8', () => {
    expect(showsUnicode({ LANG: 'en_US.UTF-8' })).toBe(true);
    expect(showsUnicode({ LANG: 'cs_CZ.utf8' })).toBe(true);
  });

  it('should show ASCII where no locale is set', () => {
    expect(showsUnicode({})).toBe(false);
  });

  it('should go by the first locale variable that is set', () => {
    expect(showsUnicode({ LC_ALL: 'C', LANG: 'en_US.UTF-8' })).toBe(false);
    expect(showsUnicode({ LC_ALL: '', LANG: 'en_US.UTF-8' })).toBe(true);
  });
});
