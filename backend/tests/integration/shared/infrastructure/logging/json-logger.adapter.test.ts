import { Writable } from 'node:stream';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { JsonLogger } from '#infrastructure/logging/json-logger.adapter';
import {
  LOG_SETTINGS,
  type LogSettings,
} from '#infrastructure/logging/log-settings';
import { CLOCK } from '#kernel/time/clock';
import { LOGGER, type Logger } from '#ports/logger.port';
import { FixedClock } from '#tests/support/fixed-clock';

const START = '2026-11-21T10:00:00.000Z';
const PRIVATE = 'zz-private-zz-private-zz';

let written: string[];
let clock: FixedClock;

/** A stream that keeps what it is given, in memory. */
function memoryStream(): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, done): void {
      written.push(chunk.toString('utf8'));
      done();
    },
  });
}

function loggerWith(settings: Partial<LogSettings> = {}): JsonLogger {
  return new JsonLogger(clock, {
    stream: memoryStream(),
    level: 'debug',
    secrets: [],
    ...settings,
  });
}

function lines(): unknown[] {
  return written
    .join('')
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

beforeEach(() => {
  written = [];
  clock = new FixedClock(START);
});

describe('JsonLogger', () => {
  it('should write one JSON object a line, with the moment from the clock', () => {
    const logger = loggerWith();

    logger.info('The job was claimed.', { jobId: 'job-1', runs: 2 });
    clock.advance(1_500);
    logger.error('The job failed.');

    expect(written.every((chunk) => chunk.endsWith('\n'))).toBe(true);
    expect(lines()).toEqual([
      {
        time: START,
        level: 'info',
        message: 'The job was claimed.',
        fields: { jobId: 'job-1', runs: 2 },
      },
      {
        time: '2026-11-21T10:00:01.500Z',
        level: 'error',
        message: 'The job failed.',
        fields: {},
      },
    ]);
  });

  it('should name the level of each line', () => {
    const logger = loggerWith();

    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');

    expect(lines()).toMatchObject([
      { level: 'debug' },
      { level: 'info' },
      { level: 'warn' },
      { level: 'error' },
    ]);
  });

  describe('when a level is set', () => {
    it('should leave out the lines that are less urgent', () => {
      const logger = loggerWith({ level: 'warn' });

      logger.debug('a');
      logger.info('b');
      logger.warn('c');
      logger.error('d');

      expect(lines()).toMatchObject([{ message: 'c' }, { message: 'd' }]);
    });
  });

  describe('child', () => {
    it('should add its fields to every line it writes', () => {
      const job = loggerWith().child({ jobId: 'job-1' });

      job.info('Started.');
      job.child({ attempt: 2 }).warn('Retried.', { reason: 'lease_lost' });

      expect(lines()).toMatchObject([
        { message: 'Started.', fields: { jobId: 'job-1' } },
        {
          message: 'Retried.',
          fields: { jobId: 'job-1', attempt: 2, reason: 'lease_lost' },
        },
      ]);
    });

    it('should let the most specific value of a field win', () => {
      const logger = loggerWith().child({ step: 'clone', ok: true });

      logger.child({ step: 'install' }).info('a');
      logger.info('b', { ok: false });

      expect(lines()).toMatchObject([
        { fields: { step: 'install', ok: true } },
        { fields: { step: 'clone', ok: false } },
      ]);
    });

    it('should not add its fields to the lines of its parent', () => {
      const logger = loggerWith();
      logger.child({ jobId: 'job-1' });

      logger.info('a');

      expect(lines()).toMatchObject([{ fields: {} }]);
    });
  });

  describe('when it is told about secrets', () => {
    it('should replace them in messages, names and values of fields', () => {
      const logger = loggerWith({ secrets: [PRIVATE] });

      logger.info(`gh said: bad credentials ${PRIVATE}`, {
        [PRIVATE]: `Bearer ${PRIVATE}`,
        header: PRIVATE,
      });

      expect(lines()).toEqual([
        {
          time: START,
          level: 'info',
          message: 'gh said: bad credentials [redacted]',
          fields: { '[redacted]': 'Bearer [redacted]', header: '[redacted]' },
        },
      ]);
      expect(written.join('')).not.toContain(PRIVATE);
    });

    it('should replace a number or a flag that spells a secret', () => {
      const logger = loggerWith({ secrets: ['424242', 'true'] });

      logger.info('a', { pin: 424242, flag: true, count: 7, none: null });

      expect(lines()).toMatchObject([
        {
          fields: {
            pin: '[redacted]',
            flag: '[redacted]',
            count: 7,
            none: null,
          },
        },
      ]);
    });

    it('should replace a secret whose JSON spelling differs from its text', () => {
      const secret = 'p"a\\ss\nw0rd';
      const logger = loggerWith({ secrets: [secret] });

      logger.warn(`login with ${secret}`, { value: secret });

      expect(lines()).toMatchObject([
        { message: 'login with [redacted]', fields: { value: '[redacted]' } },
      ]);
      expect(written.join('')).not.toContain(
        JSON.stringify(secret).slice(1, -1),
      );
    });

    it('should replace a longer secret whole when it holds a shorter one', () => {
      const logger = loggerWith({ secrets: ['abc', 'xxabcxx'] });

      logger.info('xxabcxx and abc');

      expect(lines()).toMatchObject([{ message: '[redacted] and [redacted]' }]);
    });

    it('should take an empty value for no secret', () => {
      const logger = loggerWith({ secrets: [''] });
      logger.conceal('');

      logger.info('nothing is hidden');

      expect(lines()).toMatchObject([{ message: 'nothing is hidden' }]);
    });
  });

  describe('conceal', () => {
    it('should replace the secret in the lines of every logger of the root', () => {
      const root = loggerWith();
      const job = root.child({ jobId: 'job-1' });
      const other = root.child({ jobId: 'job-2' });

      job.conceal(PRIVATE);
      job.conceal(PRIVATE);
      root.info(PRIVATE);
      other.info('token', { value: PRIVATE });

      expect(lines()).toMatchObject([
        { message: '[redacted]' },
        { message: 'token', fields: { jobId: 'job-2', value: '[redacted]' } },
      ]);
    });
  });

  describe('when it is injected by its token', () => {
    it('should be the logger of the service', async () => {
      const module = await Test.createTestingModule({
        providers: [
          { provide: LOGGER, useClass: JsonLogger },
          { provide: CLOCK, useValue: clock },
          {
            provide: LOG_SETTINGS,
            useValue: {
              stream: memoryStream(),
              level: 'info',
              secrets: [PRIVATE],
            },
          },
        ],
      }).compile();
      const logger = module.get<Logger>(LOGGER);

      logger.info(PRIVATE);

      expect(logger).toBeInstanceOf(JsonLogger);
      expect(lines()).toEqual([
        { time: START, level: 'info', message: '[redacted]', fields: {} },
      ]);
    });
  });
});
