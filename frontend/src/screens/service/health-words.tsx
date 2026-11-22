import type {
  Health,
  LimitWindow,
  SubscriptionLimits,
  ToolVersion,
  WorkerState,
} from '@coverage-autopilot/api-contracts/health';
import type { Billing } from '@coverage-autopilot/api-contracts/statuses';

import type { Fact } from '#components/fact-line';
import { countWords, percentWords } from '#theme/counts';
import { ageWords, clockWords, durationWords, elapsedMs } from '#theme/moments';
import { GENERATOR_WORDS, type StatusLook } from '#theme/status';

/** The moment now and the zone of the user, for every age and time. */
export interface Moment {
  readonly now: string;
  readonly timeZone: string;
}

/** One row of a part of the screen: its label and what it says. */
export interface HealthRow {
  readonly label: string;
  readonly fact: Fact;
}

/**
 * What the health does not tell yet. It is said so, never made up: an
 * empty answer is allowed for the account, the limits and the versions.
 */
export const UNKNOWN: Fact = {
  text: 'not known yet',
  glyph: { name: 'skipped', role: 'secondary' },
};

const FOUND = { name: 'passed', role: 'success' } as const;
const WRONG = { name: 'attention', role: 'warning' } as const;

const BILLING_WORDS: Readonly<Record<Billing, string>> = {
  subscription: 'a subscription',
  api_key: 'an API key',
};

/** The one sentence at the top, which answers whether all is in order. */
export function headlineOf(health: Health): StatusLook {
  if (!health.ready) {
    return {
      glyph: WRONG.name,
      word: 'The service is not ready',
      role: WRONG.role,
    };
  }
  return health.worker.alive
    ? { glyph: 'on', word: 'Everything is in order', role: 'success' }
    : { glyph: WRONG.name, word: 'The worker has stopped', role: WRONG.role };
}

function workerFact(worker: WorkerState, now: string): Fact {
  const sign =
    worker.lastSeenAt === null
      ? 'last sign not known yet'
      : `last sign ${ageWords(worker.lastSeenAt, now)} ago`;
  return worker.alive
    ? { text: `alive, ${sign}`, role: 'primary' }
    : { text: `stopped, ${sign}`, role: 'warning', glyph: WRONG };
}

/** The service, its worker, the work that runs and the versions. */
export function statusRows(health: Health, { now }: Moment): HealthRow[] {
  const { scans, improvements } = health.activeWork;
  const started = durationWords(elapsedMs(health.startedAt, now));
  return [
    {
      label: 'Service',
      fact: {
        text: `${health.ready ? 'running' : 'starting'}, started ${started} ago`,
        role: 'primary',
      },
    },
    { label: 'Worker', fact: workerFact(health.worker, now) },
    {
      label: 'Running',
      fact: {
        text: `${countWords(scans, 'scan')}, ${countWords(improvements, 'improvement')}`,
        role: 'primary',
      },
    },
    {
      label: 'Versions',
      fact: {
        text: `service ${health.serviceVersion}, contract ${String(health.contractVersion)}`,
        role: 'primary',
      },
    },
  ];
}

function toolRow(tool: ToolVersion): HealthRow {
  return {
    label: tool.name,
    fact:
      tool.version === null
        ? UNKNOWN
        : {
            text: `${tool.name} ${tool.version}`,
            role: 'primary',
            glyph: FOUND,
          },
  };
}

function windowFact(window: LimitWindow | null, { timeZone }: Moment): Fact {
  return window === null
    ? UNKNOWN
    : {
        text: `${percentWords(window.usedPercent)} used, renews at ${clockWords(window.resetsAt, timeZone)}`,
        role: 'primary',
      };
}

function limitRows(
  limits: SubscriptionLimits | null,
  moment: Moment,
): HealthRow[] {
  if (limits === null) {
    return [{ label: 'Limits', fact: UNKNOWN }];
  }
  return [
    { label: '5 hours', fact: windowFact(limits.fiveHour, moment) },
    { label: '7 days', fact: windowFact(limits.sevenDay, moment) },
    {
      label: 'Limits seen',
      fact: { text: `${ageWords(limits.observedAt, moment.now)} ago` },
    },
  ];
}

/** The tools, the account of the code host and the generator. */
export function environmentRows(health: Health, moment: Moment): HealthRow[] {
  const tools =
    health.tools.length === 0
      ? [{ label: 'Tools', fact: UNKNOWN }]
      : health.tools.map(toolRow);
  const { generator } = health;
  return [
    ...tools,
    {
      label: 'Code host',
      fact:
        health.githubAccount === null
          ? UNKNOWN
          : {
              text: `signed in as ${health.githubAccount}`,
              role: 'primary',
              glyph: FOUND,
            },
    },
    {
      label: 'Generator',
      fact: {
        text: `${GENERATOR_WORDS[generator.cli]}, paid by ${BILLING_WORDS[generator.billing]}`,
        role: 'primary',
      },
    },
    ...limitRows(generator.limits, moment),
  ];
}
