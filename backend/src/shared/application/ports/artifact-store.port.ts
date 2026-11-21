export interface SaveArtifactRequest {
  /** The object the output belongs to, such as `improvement:<id>`. */
  readonly owner: string;
  /** What the output is, such as `attempt-2-test-run`. */
  readonly label: string;
  readonly content: string;
}

/**
 * The name of a stored file, as text for a column of the database. It
 * holds the hash of the content, so the same content gives the same
 * reference and a late writer cannot change what a reference points to.
 */
export type ArtifactReference = string;

/**
 * Keeps the raw output of the tools in files. Nothing a verdict or a
 * recovery depends on is stored here: a file that is gone reads as `null`
 * and shows as "not available".
 *
 * A reference is given to the database only after `save` returned, in the
 * transaction that saves the state.
 */
export interface ArtifactStore {
  save(request: SaveArtifactRequest): Promise<ArtifactReference>;
  read(reference: ArtifactReference): Promise<string | null>;
}

/** The injection token of the artifact store. */
export const ARTIFACT_STORE = Symbol('ArtifactStore');
