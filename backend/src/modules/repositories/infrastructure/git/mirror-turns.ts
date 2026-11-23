import { Injectable } from '@nestjs/common';

/**
 * The turns of the mirrors of one service, by the path of each. git moves
 * a branch under a lock, and only from the commit it read first, so a
 * fetch that meets another one in the same mirror fails: the lock is
 * taken, or the branch moved under it. One service owns its mirrors, and
 * the adapter of git and that of the working copies both change them, so
 * the two share these turns and a mirror takes one change at a time.
 */
@Injectable()
export class MirrorTurns {
  /** The end of the last turn asked for, by mirror. It never rejects. */
  private readonly last = new Map<string, Promise<undefined>>();

  /** Runs `operation` once every turn asked before it for the mirror ended. */
  public async take<Value>(
    path: string,
    operation: () => Promise<Value>,
  ): Promise<Value> {
    const previous = this.last.get(path);
    const turn = Promise.withResolvers<undefined>();
    this.last.set(path, turn.promise);
    await previous;
    try {
      return await operation();
    } finally {
      turn.resolve(undefined);
      if (this.last.get(path) === turn.promise) {
        this.last.delete(path);
      }
    }
  }
}
