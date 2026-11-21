import { InvalidUncoveredCodeError } from '#coverage/domain/errors/invalid-uncovered-code.error';
import { ValueObject } from '#kernel/primitives/value-object';

/** Lines from `start` to `end`, both counted from 1 and both included. */
export interface LineRange {
  readonly start: number;
  readonly end: number;
}

export interface UncoveredFunction {
  readonly name: string;
  readonly line: number;
}

interface UncoveredCodeProps {
  readonly lines: readonly LineRange[];
  /** The lines where a branch has a way that never ran. */
  readonly branchLines: readonly number[];
  readonly functions: readonly UncoveredFunction[];
}

function isLine(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function holdsLines(props: UncoveredCodeProps): boolean {
  return (
    props.lines.every(
      (range) =>
        isLine(range.start) && isLine(range.end) && range.start <= range.end,
    ) &&
    props.branchLines.every(isLine) &&
    props.functions.every((uncovered) => isLine(uncovered.line))
  );
}

/**
 * What of a file never ran: its lines, the lines of its open branches and
 * its functions. It tells the generator where to look.
 */
export class UncoveredCode extends ValueObject<UncoveredCodeProps> {
  private constructor(props: UncoveredCodeProps) {
    super(props);
  }

  public static create(props: UncoveredCodeProps): UncoveredCode {
    if (!holdsLines(props)) {
      throw new InvalidUncoveredCodeError(
        'Every line of uncovered code is a whole number from 1, and a ' +
          'range does not end before it starts.',
      );
    }
    return new UncoveredCode({
      lines: props.lines.map((range) => ({ ...range })),
      branchLines: [...props.branchLines],
      functions: props.functions.map((uncovered) => ({ ...uncovered })),
    });
  }

  public static none(): UncoveredCode {
    return new UncoveredCode({ lines: [], branchLines: [], functions: [] });
  }

  public get lines(): readonly LineRange[] {
    return this.props.lines;
  }

  public get branchLines(): readonly number[] {
    return this.props.branchLines;
  }

  public get functions(): readonly UncoveredFunction[] {
    return this.props.functions;
  }

  /** The ranges and the functions are plain records, so they compare by text. */
  public override equals(other: UncoveredCode): boolean {
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
