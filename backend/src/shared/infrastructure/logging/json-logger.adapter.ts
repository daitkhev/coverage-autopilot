import { Inject, Injectable } from '@nestjs/common';

import { FieldLogger } from '#infrastructure/logging/field-logger';
import { JsonLogLines } from '#infrastructure/logging/json-log-lines';
import {
  LOG_SETTINGS,
  type LogSettings,
} from '#infrastructure/logging/log-settings';
import { CLOCK, type Clock } from '#kernel/time/clock';

/**
 * The root logger of the service: one JSON object per line, with the
 * moment from the clock, the level, the message and the fields. Its
 * children write to the same stream and replace the same secrets.
 */
@Injectable()
export class JsonLogger extends FieldLogger {
  public constructor(
    @Inject(CLOCK) clock: Clock,
    @Inject(LOG_SETTINGS) settings: LogSettings,
  ) {
    super(new JsonLogLines(clock, settings), {});
  }
}
