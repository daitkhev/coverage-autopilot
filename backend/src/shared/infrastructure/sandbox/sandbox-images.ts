import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';

import { ToolLog } from '#infrastructure/logging/tool-log';
import { prepareImage } from '#infrastructure/sandbox/image-preparation';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';
import { CLOCK, type Clock } from '#kernel/time/clock';
import { LOGGER, type Logger } from '#ports/logger.port';

/** One image of the engine, as the settings of a sandbox name it. */
function keyOf(settings: SandboxSettings): string {
  return JSON.stringify([settings.image, settings.build?.file ?? null]);
}

/** Waits for the work, or throws the reason of the signal once it aborts. */
async function waitFor(
  work: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  const aborted = Promise.withResolvers<'aborted'>();
  const onAbort = (): void => {
    aborted.resolve('aborted');
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const first = await Promise.race([work, aborted.promise]);
    if (first === 'aborted') {
      signal.throwIfAborted();
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * The images the sandboxes of the service run in, each made ready once:
 * found in the engine, built, or pulled. A command that comes while its
 * image is prepared waits for that same preparation, and stops waiting
 * once its signal is aborted, while the preparation goes on for the next
 * command. A failed preparation is not kept: the next command tries
 * again. A preparation that still runs when the service stops is cut
 * short, so no program of the engine outlives the service. Each call of
 * the engine writes its line, as the calls of a sandbox do.
 */
@Injectable()
export class SandboxImages implements OnModuleDestroy {
  private readonly prepared = new Set<string>();
  private readonly preparing = new Map<string, Promise<void>>();
  private readonly closing = new AbortController();
  private readonly log: ToolLog;

  public constructor(
    @Inject(LOGGER) logger: Logger,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.log = new ToolLog(logger, clock);
  }

  /** Settles once the engine has the image of the settings. */
  public async ready(
    settings: SandboxSettings,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const key = keyOf(settings);
    if (this.prepared.has(key)) {
      return;
    }
    const preparation = this.preparing.get(key) ?? this.start(key, settings);
    await waitFor(preparation, signal);
  }

  public async onModuleDestroy(): Promise<void> {
    this.closing.abort();
    await Promise.allSettled(this.preparing.values());
  }

  private start(key: string, settings: SandboxSettings): Promise<void> {
    const preparation = this.prepare(key, settings);
    this.preparing.set(key, preparation);
    return preparation;
  }

  private async prepare(key: string, settings: SandboxSettings): Promise<void> {
    try {
      await prepareImage(settings, {
        log: this.log,
        signal: this.closing.signal,
      });
      this.prepared.add(key);
    } finally {
      this.preparing.delete(key);
    }
  }
}
