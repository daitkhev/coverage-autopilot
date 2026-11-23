import {
  type Repository,
  repositoryListSchema,
  repositorySchema,
} from '@coverage-autopilot/api-contracts/repositories';

import { type Answer, CREATED, OK } from '#tests/support/contract-ledger';
import { choicesOf, send, type Storm } from '#tests/support/storm';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';

interface Ask {
  readonly fullName: string;
  /** The address as a person typed it. */
  readonly url: string;
}

interface Registration extends Ask {
  readonly answer: Answer;
}

/** What one repository was answered in one round. */
interface RoundOfOne {
  readonly fullName: string;
  readonly round: number;
  readonly sent: readonly Registration[];
}

/**
 * The spellings of one address. A request that finds no repository asks
 * the host with the address as it was typed, and a host on a file system
 * that tells the case of letters apart would not know another case. So a
 * spelling in capitals comes once the repository is connected, when the
 * service finds it without asking the host.
 */
function spellingsOf(fullName: string, round: number): string[] {
  const url = TemporaryCodeHost.urlOf(fullName);
  const plain = [url, `${url}.git`, `${url}/`];
  return round === 1
    ? plain
    : [...plain, TemporaryCodeHost.urlOf(fullName.toUpperCase())];
}

/** Many requests for one repository and a few for each other one. */
function asksOf(storm: Storm, round: number): Ask[] {
  const random = choicesOf(storm, `registrations:${String(round)}`);
  const focus = random.below(storm.repositories.length);
  const { atOnce, spread } = storm.sizes;
  const asks = storm.repositories.flatMap((fullName, index) =>
    Array.from({ length: index === focus ? atOnce : spread }, () => ({
      fullName,
      url: random.pick(spellingsOf(fullName, round)),
    })),
  );
  return random.shuffled(asks);
}

/** Only the first answer of the run for a repository may be a creation. */
function creationFindings(group: RoundOfOne): string[] {
  const created = group.sent.filter(
    ({ answer }) => answer.status === CREATED,
  ).length;
  const expected = group.round === 1 ? 1 : 0;
  return created === expected
    ? []
    : [
        `${group.fullName} was answered ${String(created)} times with ` +
          `${String(CREATED)} in round ${String(group.round)}, not ` +
          `${String(expected)}.`,
      ];
}

/** One id for every spelling, in every round, and one address it keeps. */
function identityFindings(storm: Storm, group: RoundOfOne): string[] {
  const { fullName } = group;
  const answered = group.sent.map(({ answer }) =>
    repositorySchema.parse(answer.body),
  );
  const ids = [...new Set(answered.map((repository) => repository.id))];
  const urls = [...new Set(answered.map((repository) => repository.url))];
  const known = storm.ids.get(fullName) ?? ids[0];
  const findings: string[] = [];
  if (ids.length !== 1 || ids[0] !== known) {
    findings.push(`${fullName} was answered with the ids ${ids.join(', ')}.`);
  }
  if (urls.join() !== TemporaryCodeHost.urlOf(fullName)) {
    findings.push(`${fullName} was answered with the urls ${urls.join(', ')}.`);
  }
  if (known !== undefined) {
    storm.ids.set(fullName, known);
  }
  return findings;
}

/** A repository that exists is found or connected, never refused. */
function groupFindings(storm: Storm, group: RoundOfOne): string[] {
  const refused = group.sent.filter(
    ({ answer }) => answer.status !== OK && answer.status !== CREATED,
  );
  if (refused.length > 0) {
    return refused.map(
      ({ url, answer }) =>
        `${url} was answered ${String(answer.status)}: ` +
        JSON.stringify(answer.body),
    );
  }
  return [...creationFindings(group), ...identityFindings(storm, group)];
}

/** The list holds each repository once, under the id it was answered with. */
function listFindings(storm: Storm, items: readonly Repository[]): string[] {
  const listed = items.map((item) => `${item.owner}/${item.name}`).sort();
  const expected = [...storm.repositories].sort();
  const findings: string[] = [];
  if (listed.join() !== expected.join()) {
    findings.push(`The list holds ${listed.join(', ')}.`);
  }
  for (const item of items) {
    if (storm.ids.get(`${item.owner}/${item.name}`) !== item.id) {
      findings.push(`The list holds ${item.id}, which no request was given.`);
    }
  }
  return findings;
}

/**
 * Registers every repository many times at once, in its several
 * spellings, and gives what breaks a rule: each repository is one row
 * with one id, created once in the whole run and found every other time.
 */
export async function registeredAtOnce(
  storm: Storm,
  round: number,
): Promise<string[]> {
  const sent = await Promise.all(
    asksOf(storm, round).map(async (ask) => ({
      ...ask,
      answer: await send(storm, '/repositories', {
        method: 'POST',
        body: { url: ask.url },
      }),
    })),
  );
  const findings = storm.repositories.flatMap((fullName) =>
    groupFindings(storm, {
      fullName,
      round,
      sent: sent.filter((registration) => registration.fullName === fullName),
    }),
  );
  const list = repositoryListSchema.parse(
    (await send(storm, '/repositories')).body,
  );
  return [...findings, ...listFindings(storm, list.items)];
}
