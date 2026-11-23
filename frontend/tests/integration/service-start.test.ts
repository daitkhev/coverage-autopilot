import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { lookForService } from '#api/service-start';
import {
  type ScriptedServer,
  startScriptedServer,
} from '#tests/support/socket-server';

describe('lookForService', () => {
  describe('when a service answers', () => {
    let server: ScriptedServer;

    beforeEach(async () => {
      server = await startScriptedServer();
    });

    afterEach(async () => {
      await server.close();
    });

    it('should give the answer of its health, whatever it holds', async () => {
      server.answerWith({ status: 200, text: '{"contractVersion":99}' });

      await expect(lookForService(server.socket)).resolves.toEqual({
        status: 200,
        text: '{"contractVersion":99}',
      });
      expect(server.received.map(({ url }) => url)).toEqual(['/health']);
    });

    describe('when what answers does not speak HTTP', () => {
      it('should throw the failure, as nothing explains it', async () => {
        server.answerWith({ raw: 'NOT HTTP\r\n\r\n' });

        await expect(lookForService(server.socket)).rejects.toThrow(
          'Parse Error',
        );
      });
    });
  });

  describe('when nothing answers', () => {
    let folder: string;

    beforeEach(() => {
      folder = mkdtempSync('/tmp/look-');
    });

    afterEach(() => {
      rmSync(folder, { recursive: true, force: true });
    });

    it('should give nothing', async () => {
      await expect(
        lookForService(join(folder, 'service.sock')),
      ).resolves.toBeUndefined();
    });
  });
});
