export class CoverageReader {
  public constructor(private readonly percent: number) {}

  read(): number {
    return this.percent;
  }
}
