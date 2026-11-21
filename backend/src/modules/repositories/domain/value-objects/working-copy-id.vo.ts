import { ValueObject } from '#kernel/primitives/value-object';
import { InvalidWorkingCopyIdError } from '#repositories/domain/errors/invalid-working-copy-id.error';

/** A byte that stands for itself in the name of a folder. */
const PLAIN = /^[a-z0-9-]$/u;

/** Every other byte is written as "_" and two hex digits. */
const ESCAPE = '_';
const HEX = 16;
const HEX_DIGITS = 2;

/** An id as `fromPurpose` writes it: no ".", no "/", no capital letter. */
const ID = /^(?:[a-z0-9-]|_[0-9a-f]{2})+$/u;

/** A file system takes at most 255 bytes in the name of one folder. */
const MAX_LENGTH = 255;

const encoder = new TextEncoder();

function folderNameOf(purpose: string): string {
  return Array.from(encoder.encode(purpose), (byte) => {
    const character = String.fromCharCode(byte);
    return PLAIN.test(character)
      ? character
      : ESCAPE + byte.toString(HEX).padStart(HEX_DIGITS, '0');
  }).join('');
}

interface WorkingCopyIdProps {
  readonly value: string;
}

/**
 * The id of a working copy, which is also the name of its folder. It is
 * made from the purpose of the copy, one way and back, so two purposes
 * never share a folder, even on a file system that ignores case, and no
 * id can name a folder outside the root of the copies.
 */
export class WorkingCopyId extends ValueObject<WorkingCopyIdProps> {
  private constructor(value: string) {
    super({ value });
  }

  /** From who asks, such as `scan:<id>` or `improvement:<id>:attempt:2`. */
  public static fromPurpose(purpose: string): WorkingCopyId {
    const value = folderNameOf(purpose);
    if (value === '' || value.length > MAX_LENGTH) {
      throw new InvalidWorkingCopyIdError(
        `"${purpose}" cannot name a working copy: it is empty or too long.`,
      );
    }
    return new WorkingCopyId(value);
  }

  /** An id that a caller gives back, checked before it reaches a folder. */
  public static parse(value: string): WorkingCopyId {
    if (!ID.test(value) || value.length > MAX_LENGTH) {
      throw new InvalidWorkingCopyIdError(
        `"${value}" is not the id of a working copy.`,
      );
    }
    return new WorkingCopyId(value);
  }

  public get value(): string {
    return this.props.value;
  }
}
