import type { Reader } from '#coverage/infrastructure/report-reader';

export type Merge = (reader: Reader) => string;
