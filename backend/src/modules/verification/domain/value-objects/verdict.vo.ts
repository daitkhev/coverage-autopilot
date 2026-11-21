import { ValueObject } from '#kernel/primitives/value-object';

type VerdictValue = 'accepted' | 'rejected' | 'inconclusive';

interface VerdictProps {
  readonly value: VerdictValue;
  readonly reasons: readonly string[];
}

/**
 * What the gate decides about a patch, with a sentence for each required
 * check that did not pass. `inconclusive` says nothing about the patch: a
 * required check could not finish.
 */
export class Verdict extends ValueObject<VerdictProps> {
  private constructor(props: VerdictProps) {
    super(props);
  }

  public static accepted(): Verdict {
    return new Verdict({ value: 'accepted', reasons: [] });
  }

  public static rejected(reasons: readonly string[]): Verdict {
    return new Verdict({ value: 'rejected', reasons: [...reasons] });
  }

  public static inconclusive(reasons: readonly string[]): Verdict {
    return new Verdict({ value: 'inconclusive', reasons: [...reasons] });
  }

  public get value(): VerdictValue {
    return this.props.value;
  }

  public get reasons(): readonly string[] {
    return this.props.reasons;
  }
}
