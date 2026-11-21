/**
 * The injection token of the sandbox the generator runs in. It is a second
 * instance of the port `Sandbox`, bound when the service starts: an image
 * with the CLI, an open network for the model's service, and a larger
 * limit of output, since a run streams every event it has.
 */
export const GENERATOR_SANDBOX = Symbol('GeneratorSandbox');
