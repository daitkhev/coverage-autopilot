import type { ServiceSetting } from '#app/service-door';

/** The variables of the process, as the entry file hands them on. */
export type Environment = Readonly<Record<string, string | undefined>>;

/**
 * The folder a service of its own is made in. The path of a socket is at
 * most 104 bytes, and the temporary folder of macOS alone is longer.
 */
const SHORT_TEMPORARY_ROOT = '/tmp';

/** The variables that say which characters the terminal can show. */
const LOCALE_VARIABLES = ['LC_ALL', 'LC_CTYPE', 'LANG'];

/**
 * A started service gets what the client was started with, as it would
 * from a person who started it by hand. It reads the variables it knows.
 */
function setVariables(environment: Environment): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value]],
    ),
  );
}

/** Where the service is, and what one that the client starts is given. */
export function serviceSettingOf(
  environment: Environment,
  command: ServiceSetting['command'],
): ServiceSetting {
  const instanceDirectory = environment['AUTOPILOT_INSTANCE_DIR'];
  return {
    instance: {
      home: environment['HOME'] ?? '',
      ...(instanceDirectory === undefined ? {} : { instanceDirectory }),
    },
    command,
    variables: setVariables(environment),
    temporaryRoot: SHORT_TEMPORARY_ROOT,
  };
}

/** `NO_COLOR` switches colour off, whatever it is set to. */
export function showsColour(environment: Environment): boolean {
  return environment['NO_COLOR'] === undefined;
}

/**
 * Whether the terminal shows Unicode: the first locale variable that is
 * set says so. Where none is, every symbol is its ASCII replacement.
 */
export function showsUnicode(environment: Environment): boolean {
  const locale = LOCALE_VARIABLES.map((name) => environment[name]).find(
    (value) => value !== undefined && value !== '',
  );
  return /utf-?8/iu.test(locale ?? '');
}
