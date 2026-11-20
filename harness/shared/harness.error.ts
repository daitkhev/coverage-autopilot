/** A fault of the harness itself: a policy file it cannot read or trust. */
export class HarnessError extends Error {
  public override readonly name = 'HarnessError';
}
