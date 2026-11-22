import type { BudgetSettings } from '@coverage-autopilot/api-contracts/improvements';
import type { AccessCheck } from '@coverage-autopilot/api-contracts/repositories';
import type { ImprovementMode } from '@coverage-autopilot/api-contracts/statuses';

import type { ServiceAnswer, ServiceApi } from '#api/service-api';

/** What the dialog needs before anything can start. */
export interface StartFacts {
  readonly settings: BudgetSettings;
  readonly access: AccessCheck;
}

/**
 * The limits with their maximums, and the preflight, asked together: the
 * dialog shows neither until it can show both.
 */
export async function loadStartFacts(
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

/** What the person chose: three limits and how the work is published. */
export interface Limits {
  readonly attempts: number;
  readonly tokens: number | null;
  readonly minutes: number;
  readonly mode: ImprovementMode;
}

/** A field of the form. */
export type LimitField = 'attempts' | 'tokens' | 'minutes' | 'mode';

type NumberField = Exclude<LimitField, 'mode'>;

/** How far one press of an arrow moves a limit, and its least value. */
const STEPS: Readonly<Record<NumberField, number>> = {
  attempts: 1,
  tokens: 10_000,
  minutes: 5,
};

/**
 * The limits the service fills a request with. Waiting for approval is
 * chosen first, because it is the answer that publishes nothing alone.
 */
export function limitsOf(settings: BudgetSettings): Limits {
  return { ...settings.defaults, mode: 'review' };
}

/**
 * The fields in their order. Under a subscription the service has no
 * limit of tokens, so that field is not there.
 */
export function fieldsOf(
  settings: BudgetSettings,
): readonly [LimitField, ...LimitField[]] {
  return settings.maximums.tokens === null
    ? ['attempts', 'minutes', 'mode']
    : ['attempts', 'tokens', 'minutes', 'mode'];
}

/**
 * A field moved by one step up or down. A limit stays between one step
 * and the maximum of the service, so a start is not refused for it. No
 * limit of tokens is taken as the maximum, the nearest to no limit.
 */
export function changed(
  limits: Limits,
  {
    field,
    by,
    settings,
  }: {
    readonly field: LimitField;
    readonly by: number;
    readonly settings: BudgetSettings;
  },
): Limits {
  if (field === 'mode') {
    return {
      ...limits,
      mode: limits.mode === 'review' ? 'automatic' : 'review',
    };
  }
  const step = STEPS[field];
  const highest = settings.maximums[field] ?? Number.POSITIVE_INFINITY;
  const current = limits[field] ?? highest;
  return {
    ...limits,
    [field]: Math.min(Math.max(current + by * step, step), highest),
  };
}
