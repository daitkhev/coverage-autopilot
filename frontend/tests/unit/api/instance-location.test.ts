import { describe, expect, it } from 'vitest';

import { instanceLocationIn, instanceLocationOf } from '#api/instance-location';

const HOME = '/home/example';

describe('instanceLocationIn', () => {
  it('should name the socket and the log the service keeps in the folder', () => {
    expect(instanceLocationIn('/tmp/instance')).toEqual({
      directory: '/tmp/instance',
      socket: '/tmp/instance/service.sock',
      log: '/tmp/instance/service.log',
    });
  });

  it('should drop the `..` and the trailing slash, as the service does', () => {
    expect(instanceLocationIn('/tmp/a/../instance/').directory).toBe(
      '/tmp/instance',
    );
  });
});

describe('instanceLocationOf', () => {
  describe('when no instance directory is set', () => {
    it('should take the folder under the home', () => {
      expect(instanceLocationOf({ home: HOME }).socket).toBe(
        '/home/example/.coverage-autopilot/service.sock',
      );
    });
  });

  describe('when an instance directory is set', () => {
    it('should take it, without the space around it', () => {
      expect(
        instanceLocationOf({
          instanceDirectory: ' /srv/autopilot ',
          home: HOME,
        }).directory,
      ).toBe('/srv/autopilot');
    });
  });

  describe('when the instance directory is empty', () => {
    it('should take the folder under the home, as the service does', () => {
      expect(
        instanceLocationOf({ instanceDirectory: '  ', home: ` ${HOME}` })
          .directory,
      ).toBe('/home/example/.coverage-autopilot');
    });
  });
});
