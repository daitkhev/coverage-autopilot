import {
  CONTRACT_VERSION,
  type Health,
  type LimitWindow,
  type SubscriptionLimits,
  type ToolVersion,
  type WorkerState,
} from '@coverage-autopilot/api-contracts/health';

import { labelled } from '#commands/columns';
import type { Command } from '#commands/command';
import type { CommandIo } from '#commands/command-io';
import { printResult } from '#commands/output';
import { statusText, symbolText } from '#commands/words';
import { countWords, percentWords } from '#theme/counts';
import { ageWords, clockWords, durationWords, elapsedMs } from '#theme/moments';
import { SERVICE_STATE } from '#theme/status';

/** What the service does not know, it does not say: unknown stays unknown. */
const UNKNOWN = 'unknown';

function versionWords(health: Health): string {
  return (
    `service ${health.serviceVersion}, ` +
    `contract ${String(health.contractVersion)}, ` +
    `the client reads contract ${String(CONTRACT_VERSION)}`
  );
}

function windowWords(window: LimitWindow | null, io: CommandIo): string {
  return window === null
    ? UNKNOWN
    : `${percentWords(window.usedPercent)} used, ` +
        `opens again at ${clockWords(window.resetsAt, io.session.timeZone)}`;
}

/** The limits of the subscription are as old as the last call of the generator. */
function limitsWords(limits: SubscriptionLimits | null, io: CommandIo): string {
  return limits === null
    ? UNKNOWN
    : `five hours ${windowWords(limits.fiveHour, io)}; ` +
        `seven days ${windowWords(limits.sevenDay, io)}; ` +
        `seen ${ageWords(limits.observedAt, io.session.now())} ago`;
}

function workerWords(worker: WorkerState, io: CommandIo): string {
  const state = worker.alive
    ? `${symbolText('on', io)} alive`
    : `${symbolText('failed', io)} stopped`;
  return worker.lastSeenAt === null
    ? state
    : `${state}, last seen ${ageWords(worker.lastSeenAt, io.session.now())} ago`;
}

function toolsWords(tools: readonly ToolVersion[]): string {
  return tools
    .map((tool) => `${tool.name} ${tool.version ?? UNKNOWN}`)
    .join(', ');
}

function healthLines(health: Health, io: CommandIo): string[] {
  const { generator, activeWork } = health;
  const started = elapsedMs(health.startedAt, io.session.now());
  return [
    labelled(
      'service',
      statusText(SERVICE_STATE[health.ready ? 'up' : 'starting'], io),
    ),
    labelled('versions', versionWords(health)),
    labelled('started', `${durationWords(started)} ago`),
    labelled('account', health.githubAccount ?? UNKNOWN),
    labelled('generator', `${generator.cli}, ${generator.billing}`),
    labelled('limits', limitsWords(generator.limits, io)),
    labelled('worker', workerWords(health.worker, io)),
    labelled(
      'running',
      `${countWords(activeWork.scans, 'scan')}, ` +
        countWords(activeWork.improvements, 'improvement'),
    ),
    labelled('tools', toolsWords(health.tools)),
  ];
}

/**
 * `doctor`: the state of the service as its health says it: versions,
 * account, generator, worker, running work and tools.
 */
export async function doctor(
  _command: Command<'doctor'>,
  io: CommandIo,
): Promise<number> {
  const health = await io.session.api.health();
  return printResult(health, (value) => healthLines(value, io), io);
}
