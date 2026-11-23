import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ToolLog } from '#infrastructure/logging/tool-log';
import {
  askEngine,
  awaitEngine,
  type EngineAnswer,
} from '#infrastructure/sandbox/engine-answer';
import { notRunningFault } from '#infrastructure/sandbox/engine-faults';
import { SandboxEngineNotRunningError } from '#infrastructure/sandbox/errors/sandbox-engine-not-running.error';
import { SandboxImageBuildFailedError } from '#infrastructure/sandbox/errors/sandbox-image-build-failed.error';
import { SandboxImageFileMissingError } from '#infrastructure/sandbox/errors/sandbox-image-file-missing.error';
import { SandboxImagePullFailedError } from '#infrastructure/sandbox/errors/sandbox-image-pull-failed.error';
import {
  buildArguments,
  fileDigestOf,
  inspectArguments,
  pullArguments,
} from '#infrastructure/sandbox/image-arguments';
import type {
  ImageBuild,
  SandboxSettings,
} from '#infrastructure/sandbox/sandbox-settings';

/**
 * A first build downloads a base image and installs a package, and a pull
 * downloads an image: minutes on a slow link, as for the install of the
 * packages of a repository, which has the same default limit. An engine
 * that takes longer is stuck, or on a link no generation could use.
 */
const IMAGE_WORK_TIMEOUT_MS = 600_000;

const SECONDS_PER_MINUTE = 60;

/** The end of the output of a build or a pull, which tells why it failed. */
const SAID_BYTES = 2_000;

/**
 * The folder the engine is given beside the file. The file copies
 * nothing, and the engine reads all of the folder it is given, so it is a
 * new empty one: never the folder of the file, which in the sources holds
 * the code of the service.
 */
const CONTEXT_PREFIX = 'coverage-autopilot-build-';

/** The file an image is to be built from, and its digest. */
interface Recipe {
  readonly file: string;
  readonly digest: string;
}

/** Where the calls of a preparation are logged, and what stops it. */
interface ImageWork {
  readonly log: ToolLog;
  readonly signal: AbortSignal;
}

type FaultOf = (detail: string) => Error;

async function recipeOf(image: string, build: ImageBuild): Promise<Recipe> {
  try {
    const digest = fileDigestOf(await readFile(build.file));
    return { file: build.file, digest };
  } catch (error) {
    throw new SandboxImageFileMissingError(
      `The image ${image} is built from ${build.file}, which cannot be ` +
        'read. The package of the service is incomplete: install it again.',
      { cause: error },
    );
  }
}

/** The label of the file of the image, or `null` when there is no image. */
async function labelOf(
  settings: SandboxSettings,
  log: ToolLog,
): Promise<string | null> {
  const { image } = settings;
  const answer = await askEngine(settings, inspectArguments(image), log);
  if (answer.outcome === 'silent') {
    throw new SandboxEngineNotRunningError(
      `The engine did not say within ${String(answer.waitedSeconds)} ` +
        `seconds whether it has the image ${image}.`,
    );
  }
  if (answer.exitCode === 0) {
    return answer.output.trim();
  }
  const fault = notRunningFault(answer.output.trim());
  if (fault !== null) {
    throw fault;
  }
  return null;
}

/** A long call of the engine, of which only the end of the output is kept. */
async function work(
  settings: SandboxSettings,
  args: readonly string[],
  on: ImageWork,
): Promise<EngineAnswer> {
  const limits = { ...settings.limits, outputBytes: SAID_BYTES };
  return awaitEngine({ ...settings, limits }, args, {
    log: on.log,
    timeoutMs: IMAGE_WORK_TIMEOUT_MS,
    signal: on.signal,
  });
}

/** Ends well, or throws what the answer to a long call says. */
function checkWork(answer: EngineAnswer, faultOf: FaultOf): void {
  if (answer.outcome === 'silent') {
    const minutes = String(answer.waitedSeconds / SECONDS_PER_MINUTE);
    throw faultOf(`It did not end within ${minutes} minutes.`);
  }
  if (answer.exitCode === 0) {
    return;
  }
  const said = answer.output.trim();
  throw (
    notRunningFault(said) ??
    faultOf(
      `It ended with the exit code ${String(answer.exitCode)}, and the end ` +
        `of what it said is: ${said}`,
    )
  );
}

async function build(
  settings: SandboxSettings,
  recipe: Recipe,
  on: ImageWork,
): Promise<void> {
  const { image } = settings;
  const context = await mkdtemp(join(tmpdir(), CONTEXT_PREFIX));
  try {
    const source = { ...recipe, context };
    const answer = await work(settings, buildArguments(image, source), on);
    checkWork(
      answer,
      (detail) =>
        new SandboxImageBuildFailedError(
          `The engine did not build the image ${image} from ` +
            `${recipe.file}. ${detail}`,
        ),
    );
  } finally {
    await rm(context, { recursive: true, force: true });
  }
}

async function pull(settings: SandboxSettings, on: ImageWork): Promise<void> {
  const { image } = settings;
  const answer = await work(settings, pullArguments(image), on);
  checkWork(
    answer,
    (detail) =>
      new SandboxImagePullFailedError(
        `The engine has no image ${image} and did not pull it. ${detail}`,
      ),
  );
}

/**
 * Makes sure the engine has the image of a sandbox. An image the service
 * builds is built when the engine lacks it or has it labelled with
 * another file: the build moves the name to the new image, and the old
 * one stays in the engine, nameless, since a container of another
 * instance may still run from it. Any other image is pulled when the
 * engine lacks it. Each call of the engine writes its line to the log of
 * `on`, and a build or a pull stops once its signal is aborted.
 */
export async function prepareImage(
  settings: SandboxSettings,
  on: ImageWork,
): Promise<void> {
  const recipe =
    settings.build === undefined
      ? null
      : await recipeOf(settings.image, settings.build);
  const label = await labelOf(settings, on.log);
  if (recipe !== null && label !== recipe.digest) {
    await build(settings, recipe, on);
  } else if (recipe === null && label === null) {
    await pull(settings, on);
  }
}
