import { ValueObject } from '#kernel/primitives/value-object';
import { InvalidRepositoryUrlError } from '#repositories/domain/errors/invalid-repository-url.error';

/** The host of the code. A repository is cloned from it over HTTPS alone. */
const CODE_HOST = 'github.com';

const SCHEME = 'https:';
const TRAILING_SLASH = /\/$/u;
const GIT_SUFFIX = /\.git$/u;

/** The rule of the host for an account: letters, digits, inner hyphens. */
const OWNER = /^[A-Za-z0-9](?:-?[A-Za-z0-9]){0,38}$/u;

/** Letters, digits, ".", "_" and "-", and never "." or ".." alone. */
const NAME = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/u;

interface RepositoryUrlProps {
  readonly owner: string;
  readonly name: string;
}

/** A credential, a port, a query or a fragment has no place in it. */
function isPlainAddress(url: URL): boolean {
  return [
    url.protocol === SCHEME,
    url.hostname === CODE_HOST,
    url.port === '',
    url.username === '',
    url.password === '',
    url.search === '',
    url.hash === '',
  ].every(Boolean);
}

function partsOf(text: string): RepositoryUrlProps | null {
  const url = URL.parse(text);
  if (url === null || !isPlainAddress(url)) {
    return null;
  }
  const path = url.pathname.slice(1).replace(TRAILING_SLASH, '');
  const [owner = '', given = '', ...rest] = path.split('/');
  const name = given.replace(GIT_SUFFIX, '');
  const valid = rest.length === 0 && OWNER.test(owner) && NAME.test(name);
  return valid ? { owner, name } : null;
}

/**
 * The address of a repository on the host of the code, and the owner and
 * the name read from it. Both keep the case they were given in.
 */
export class RepositoryUrl extends ValueObject<RepositoryUrlProps> {
  private constructor(props: RepositoryUrlProps) {
    super(props);
  }

  /** Takes the address with or without `.git` and a trailing slash. */
  public static parse(text: string): RepositoryUrl {
    const parts = partsOf(text);
    if (parts === null) {
      throw new InvalidRepositoryUrlError(
        `"${text}" is not the HTTPS address of a repository on ${CODE_HOST}.`,
      );
    }
    return new RepositoryUrl(parts);
  }

  public get host(): string {
    return CODE_HOST;
  }

  public get owner(): string {
    return this.props.owner;
  }

  public get name(): string {
    return this.props.name;
  }

  /** `owner/name`, as the host names a repository. */
  public get fullName(): string {
    return `${this.owner}/${this.name}`;
  }

  /** The one spelling of the address: no `.git`, no trailing slash. */
  public get value(): string {
    return `https://${CODE_HOST}/${this.fullName}`;
  }
}
