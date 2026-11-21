import { InvalidServiceConfigError } from '#infrastructure/config/errors/invalid-service-config.error';
import {
  loadServiceConfig,
  type ServiceConfig,
} from '#infrastructure/config/service-config';

/** The variables of a machine that sets nothing for the service. */
export const PLAIN_MACHINE = {
  HOME: '/home/dev',
  PATH: '/usr/local/bin:/usr/bin',
};

/** The configuration of the plain machine with these variables set. */
export function loadWith(variables: Record<string, string>): ServiceConfig {
  return loadServiceConfig({ ...PLAIN_MACHINE, ...variables });
}

/** The error that names these problems, each a sentence. */
export function refusal(...problems: string[]): InvalidServiceConfigError {
  return new InvalidServiceConfigError(
    `The service cannot start with its variables. ${problems.join(' ')}`,
  );
}
