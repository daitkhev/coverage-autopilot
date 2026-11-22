/** The variables as the entry file gets them. Empty is not set. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** The value of a variable without the space around it, or nothing. */
export function setValue(
  environment: Environment,
  name: string,
): string | undefined {
  const value = environment[name]?.trim();
  return value === '' ? undefined : value;
}

/** The variables of the list that are set, and no other. */
export function setValues(
  environment: Environment,
  names: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = setValue(environment, name);
      return value === undefined ? [] : [[name, value]];
    }),
  );
}
