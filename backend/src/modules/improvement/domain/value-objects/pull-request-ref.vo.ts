import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { ValueObject } from '#kernel/primitives/value-object';

interface PullRequestRefProps {
  readonly number: number;
  readonly url: string;
}

/** The pull request an improvement opened: its number and its address. */
export class PullRequestRef extends ValueObject<PullRequestRefProps> {
  private constructor(props: PullRequestRefProps) {
    super(props);
  }

  public static create(props: PullRequestRefProps): PullRequestRef {
    const numbered = Number.isInteger(props.number) && props.number > 0;
    if (!numbered || !URL.canParse(props.url)) {
      throw new InvalidImprovementValueError(
        `#${String(props.number)} at "${props.url}" is not a pull request: ` +
          'a number from 1 and an address.',
      );
    }
    return new PullRequestRef(props);
  }

  public get number(): number {
    return this.props.number;
  }

  public get url(): string {
    return this.props.url;
  }
}
