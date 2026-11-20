export class CoverageManager {
  public constructor(private readonly percent: number) {}

  public read(): number {
    return this.percent;
  }
}
