/** The bits of a byte that continues a character of UTF-8. */
const CONTINUATION_MASK = 0b1100_0000;
const CONTINUATION = 0b1000_0000;

/** The first byte at or after `start` that begins a character. */
function characterStart(bytes: Buffer, start: number): number {
  let index = start;
  while (
    index < bytes.length &&
    (bytes.readUInt8(index) & CONTINUATION_MASK) === CONTINUATION
  ) {
    index += 1;
  }
  return index;
}

/**
 * Keeps the last bytes of an output, at most `limit`, in the order they
 * came. The end is what tells why a run failed, so the start is dropped.
 * The text starts at a whole character.
 */
export class OutputTail {
  private readonly limit: number;
  private readonly chunks: Buffer[] = [];
  private size = 0;
  private dropped = false;

  public constructor(limit: number) {
    this.limit = limit;
  }

  public append(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    let first = this.chunks[0];
    while (first !== undefined && this.size - first.length >= this.limit) {
      this.chunks.shift();
      this.size -= first.length;
      this.dropped = true;
      first = this.chunks[0];
    }
  }

  public get truncated(): boolean {
    return this.dropped || this.size > this.limit;
  }

  public text(): string {
    const bytes = Buffer.concat(this.chunks);
    const excess = Math.max(0, bytes.length - this.limit);
    const start = this.truncated ? characterStart(bytes, excess) : 0;
    return bytes.subarray(start).toString('utf8');
  }
}
