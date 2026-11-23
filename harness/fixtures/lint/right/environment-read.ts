export type Environment = Readonly<Record<string, string | undefined>>;

export function home(environment: Environment): string | undefined {
  return environment['HOME'];
}
