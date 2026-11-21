import { ApplicationError } from '#kernel/errors/application.error';

/**
 * The detection named a runner that no adapter of the module runs. The
 * list of runners is wired when the service starts, so this is a mistake
 * of the wiring, and running again does not help.
 */
export class TestRunnerUnavailableError extends ApplicationError {
  public readonly code = 'test_runner_unavailable';
  public readonly retryable = false;
}
