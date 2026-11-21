import { z } from 'zod';

/** Istanbul counts lines from 1. A column is not read. */
const position = z.looseObject({ line: z.int().positive() });

const span = z.looseObject({ start: position });

const hits = z.record(z.string(), z.int().nonnegative());

/**
 * The coverage of one file in the `json` report of Istanbul, which both
 * Jest and Vitest write with every provider. Fields the reader does not
 * use, such as the hash and the source map, are kept and ignored.
 */
export const istanbulFileSchema = z.looseObject({
  statementMap: z.record(z.string(), span),
  fnMap: z.record(z.string(), z.looseObject({ name: z.string(), decl: span })),
  branchMap: z.record(z.string(), z.looseObject({ loc: span })),
  s: hits,
  f: hits,
  b: z.record(z.string(), z.array(z.int().nonnegative())),
});

export type IstanbulFile = z.infer<typeof istanbulFileSchema>;

/** The report: the coverage of each file, by its absolute path. */
export const istanbulReportSchema = z.record(z.string(), istanbulFileSchema);
