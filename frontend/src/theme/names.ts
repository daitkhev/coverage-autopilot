import type {
  Destination,
  Repository,
} from '@coverage-autopilot/api-contracts/repositories';

/** A commit or a patch is named by its first seven characters, as git does. */
const SHORT_HASH = 7;

/** A commit or a patch as short as git prints it: `4f2a9c1`. */
export function shortHash(hash: string): string {
  return hash.slice(0, SHORT_HASH);
}

/** A repository as its host names it and a person types it: `owner/name`. */
export function repositoryName({
  owner,
  name,
}: Pick<Repository, 'owner' | 'name'>): string {
  return `${owner}/${name}`;
}

/**
 * Where the branch and the pull request of a result go, as the words
 * after "to": the repository itself, or a fork in the account.
 */
export function destinationWords(destination: Destination): string {
  return destination.route === 'fork'
    ? `a fork in the account ${destination.account}`
    : 'the repository itself';
}
