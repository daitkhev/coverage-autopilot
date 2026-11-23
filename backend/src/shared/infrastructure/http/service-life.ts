import type { Instant } from '#kernel/time/instant';

/**
 * What the routes of the service know of the service that runs them.
 * Shared code may not import a root file, so the root binds this to the
 * running service.
 */
export interface ServiceLife {
  /** The version of the package of the service. */
  readonly version: string;
  /** When the run of the service began. */
  readonly startedAt: Instant;
  /** Whether a stop was asked. The worker claims no job from then on. */
  readonly stopping: boolean;
  /**
   * Stops the service in the reverse order of its start. A second call
   * joins the first. A route does not wait for it: the server waits for
   * the answer of that route before it closes.
   */
  stop(): Promise<void>;
}

/** The injection token of the life of the service. */
export const SERVICE_LIFE = Symbol('ServiceLife');
