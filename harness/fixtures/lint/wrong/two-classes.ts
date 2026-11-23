export class CoverageReader {
  public constructor(private readonly percent: number) {}

  public read(): number {
    return this.percent;
  }
}

export class CoverageWriter {
  public constructor(private readonly percent: number) {}

  public read(): number {
    return this.percent;
  }
}
