import type { FilePath } from '#kernel/primitives/file-path';
import { ValueObject } from '#kernel/primitives/value-object';

/** The three cases the reading of the source and the report tell apart. */
export const UNMEASURED_REASONS = [
  'parse_failed',
  'missing_from_report',
  'no_counters',
] as const;

export type UnmeasuredReason = (typeof UNMEASURED_REASONS)[number];

interface UnmeasuredFileProps {
  readonly path: FilePath;
  readonly reason: UnmeasuredReason;
  /** What a tool said about the file, when it said something. */
  readonly toolMessage: string | null;
}

/**
 * A file of the snapshot with no numbers that can be trusted. It has no
 * percentage at all, because 0% would claim that it was measured.
 */
export class UnmeasuredFile extends ValueObject<UnmeasuredFileProps> {
  private constructor(props: UnmeasuredFileProps) {
    super(props);
  }

  public static create(props: UnmeasuredFileProps): UnmeasuredFile {
    return new UnmeasuredFile(props);
  }

  public get path(): FilePath {
    return this.props.path;
  }

  public get reason(): UnmeasuredReason {
    return this.props.reason;
  }

  public get toolMessage(): string | null {
    return this.props.toolMessage;
  }
}
