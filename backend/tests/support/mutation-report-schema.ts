import { readFileSync } from 'node:fs';

/** The JSON schema of a mutation report, as the tool's package installs it. */
const SCHEMA = new URL(
  '../../../node_modules/mutation-testing-report-schema/dist/src/' +
    'mutation-testing-report-schema.json',
  import.meta.url,
);

const DEFINITIONS = '#/definitions/';

/** The keywords of JSON schema that the report schema uses to constrain. */
interface Schema {
  readonly $ref?: string;
  readonly type?: string;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly additionalProperties?: Schema;
  readonly items?: Schema;
  readonly enum?: readonly unknown[];
  readonly minimum?: number;
  readonly pattern?: string;
  readonly definitions?: Readonly<Record<string, Schema>>;
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return Number.isInteger(value) ? 'integer' : typeof value;
}

function fits(value: unknown, type: string): boolean {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
}

/** What a keyword finds wrong with a value, or `null`. */
type ValueCheck = (value: unknown, schema: Schema) => string | null;

const VALUE_CHECKS: readonly ValueCheck[] = [
  (value, { enum: allowed }) =>
    allowed === undefined || allowed.includes(value)
      ? null
      : `is none of ${allowed.join(', ')}`,
  (value, { minimum }) =>
    typeof value === 'number' && value < (minimum ?? value)
      ? `is below ${String(minimum)}`
      : null,
  (value, { pattern }) =>
    typeof value === 'string' && !new RegExp(pattern ?? '', 'u').test(value)
      ? `does not match ${String(pattern)}`
      : null,
];

function valueProblems(value: unknown, schema: Schema, at: string): string[] {
  return VALUE_CHECKS.flatMap((check) => {
    const problem = check(value, schema);
    return problem === null ? [] : [`${at} ${problem}`];
  });
}

/**
 * Checks a value against the installed JSON schema of mutation reports,
 * with the keywords that schema constrains by: `$ref`, `type`,
 * `required`, `properties`, `additionalProperties`, `items`, `enum`,
 * `minimum` and `pattern`. Its words, such as `examples`, are not read.
 */
export class MutationReportSchema {
  private readonly root: Schema = JSON.parse(
    readFileSync(SCHEMA, 'utf8'),
  ) as Schema;

  /** Every way the value breaks the schema, by where it is. */
  public problemsOf(value: unknown): string[] {
    return this.check(value, this.root, '$');
  }

  private resolved(schema: Schema): Schema {
    const name = schema.$ref?.slice(DEFINITIONS.length);
    return name === undefined ? schema : (this.root.definitions?.[name] ?? {});
  }

  private check(value: unknown, given: Schema, at: string): string[] {
    const schema = this.resolved(given);
    if (schema.type !== undefined && !fits(value, schema.type)) {
      return [`${at} is not of the type ${schema.type}`];
    }
    return [
      ...valueProblems(value, schema, at),
      ...this.childProblems(value, schema, at),
    ];
  }

  private childProblems(value: unknown, schema: Schema, at: string): string[] {
    if (Array.isArray(value)) {
      const items = schema.items ?? {};
      return value.flatMap((item, index) =>
        this.check(item, items, `${at}[${String(index)}]`),
      );
    }
    if (typeof value !== 'object' || value === null) {
      return [];
    }
    const record = value as Readonly<Record<string, unknown>>;
    const missing = (schema.required ?? [])
      .filter((key) => !Object.hasOwn(record, key))
      .map((key) => `${at}.${key} is missing`);
    const fields = Object.entries(record).flatMap(([key, field]) =>
      this.check(
        field,
        schema.properties?.[key] ?? schema.additionalProperties ?? {},
        `${at}.${key}`,
      ),
    );
    return [...missing, ...fields];
  }
}
