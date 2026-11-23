import type {
  BudgetSettings,
  Improvement,
  StartImprovementRequest,
} from '@coverage-autopilot/api-contracts/improvements';
import type { AccessCheck } from '@coverage-autopilot/api-contracts/repositories';

import { newRequestKey } from '#api/request-key';
import type { ServiceAnswer, ServiceApi } from '#api/service-api';

/** What the dialog of a start needs before anything can start. */
interface StartFacts {
  readonly settings: BudgetSettings;
  readonly access: AccessCheck;
}

/** The calls of a start of an improvement in one repository. */
export interface ImprovementStart {
  /**
   * The limits with their maximums, and the preflight, asked together: the
   * dialog shows neither until it can show both.
   */
  readonly prepare: () => Promise<ServiceAnswer<StartFacts>>;
  /** Starts the improvement with a new key, made for this one confirmation. */
  readonly start: (
    request: StartImprovementRequest,
  ) => Promise<ServiceAnswer<Improvement>>;
}

async function factsOf(
  api: ServiceApi,
  repositoryId: string,
): Promise<ServiceAnswer<StartFacts>> {
  const [settings, access] = await Promise.all([
    api.getBudgetSettings(),
    api.checkAccess(repositoryId),
  ]);
  if (settings.outcome === 'refused') {
    return settings;
  }
  return access.outcome === 'refused'
    ? access
    : { ...access, value: { settings: settings.value, access: access.value } };
}

/** The calls a start of an improvement makes in one repository. */
export function improvementStartOf(
  api: ServiceApi,
  repositoryId: string,
): ImprovementStart {
  return {
    prepare: async () => factsOf(api, repositoryId),
    start: async (request) => api.startImprovement(request, newRequestKey()),
  };
}
