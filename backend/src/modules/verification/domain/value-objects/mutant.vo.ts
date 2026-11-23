import type { FilePath } from '#kernel/primitives/file-path';
import { ValueObject } from '#kernel/primitives/value-object';
import { InvalidMutantError } from '#verification/domain/errors/invalid-mutant.error';

interface MutantProps {
  readonly file: FilePath;
  readonly mutator: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly replacement: string;
}

function isPlace(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function problemOf(props: MutantProps): string {
  const { startLine, startColumn, endLine, endColumn } = props;
  if (props.mutator === '') {
    return 'it names no mutator';
  }
  if (![startLine, startColumn, endLine, endColumn].every(isPlace)) {
    return 'its lines and columns are not whole numbers from 0';
  }
  const ordered =
    endLine > startLine || (endLine === startLine && endColumn >= startColumn);
  return ordered ? '' : 'it ends before it starts';
}

/**
 * A change a mutation tool makes to the code, named by what it is: the
 * file, the mutator, the place and the replacement. The id a tool gives
 * changes between runs, so it never names a mutant here.
 */
export class Mutant extends ValueObject<MutantProps> {
  private constructor(props: MutantProps) {
    super(props);
  }

  public static create(props: MutantProps): Mutant {
    const problem = problemOf(props);
    if (problem !== '') {
      throw new InvalidMutantError(
        `A mutant of ${props.file.value} cannot be: ${problem}.`,
      );
    }
    return new Mutant(props);
  }

  public get file(): FilePath {
    return this.props.file;
  }

  public get mutator(): string {
    return this.props.mutator;
  }

  public get startLine(): number {
    return this.props.startLine;
  }

  public get startColumn(): number {
    return this.props.startColumn;
  }

  public get endLine(): number {
    return this.props.endLine;
  }

  public get endColumn(): number {
    return this.props.endColumn;
  }

  public get replacement(): string {
    return this.props.replacement;
  }

  /**
   * One text for what the mutant is, so the mutants of two runs are matched
   * through a map and not by comparing every pair.
   */
  public get key(): string {
    const { file, mutator, replacement } = this.props;
    const { startLine, startColumn, endLine, endColumn } = this.props;
    return JSON.stringify([
      file.value,
      mutator,
      startLine,
      startColumn,
      endLine,
      endColumn,
      replacement,
    ]);
  }
}
