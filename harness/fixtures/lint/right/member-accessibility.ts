export class CoverageReader {
  public constructor(private readonly percent: number) {}

  public read(): number {
    return this.percent;
  }
}
