import type { SourceReading } from '#coverage/domain/services/file-state.service';
import type { FilePath } from '#kernel/primitives/file-path';

interface ClassifySourceRequest {
  readonly workingCopyPath: string;
  readonly path: FilePath;
}

/**
 * Parses one source file with a real parser and says whether it does not
 * parse, holds type declarations only, or holds code that runs. Nothing
 * is type-checked and nothing is run. A guess from the text is not
 * enough: the state of a file in a snapshot rests on this answer.
 */
export interface SourceClassifier {
  classify(request: ClassifySourceRequest): Promise<SourceReading>;
}

/** The injection token of the classifier of source files. */
export const SOURCE_CLASSIFIER = Symbol('SourceClassifier');
