import type { ActiveWork } from '@coverage-autopilot/api-contracts/health';

import { countWords } from '#theme/counts';

/** The command that shows the work again after the screens are closed. */
const LATER = 'coverage-autopilot list';

/**
 * What the client says as it closes while work runs: the work goes on in
 * the service, and a command shows it later. Nothing when nothing runs.
 */
export function farewellOf(work: ActiveWork | undefined): string | undefined {
  const running = [
    { count: work?.improvements ?? 0, noun: 'improvement' },
    { count: work?.scans ?? 0, noun: 'scan' },
  ].filter(({ count }) => count > 0);
  if (running.length === 0) {
    return undefined;
  }
  const total = running.reduce((sum, { count }) => sum + count, 0);
  const words = running.map(({ count, noun }) => countWords(count, noun));
  const verb = total === 1 ? 'keeps' : 'keep';
  return `${words.join(' and ')} ${verb} running. See them with: ${LATER}`;
}
