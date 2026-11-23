import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import { ContractMismatchError } from '@coverage-autopilot/api-contracts/parsing';
import { REQUEST_KEY_HEADER } from '@coverage-autopilot/api-contracts/request-key';

import type { ServiceApi } from '#api/service-api';
import { socketServiceApi } from '#api/socket-service-api';
import {
  IDLE_HEALTH,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { ROUTES } from '#tests/support/socket-routes';
import {
  type ScriptedServer,
  startScriptedServer,
} from '#tests/support/socket-server';

const NOT_FOUND: ErrorBody = {
  error: 'not_found',
  message: 'No connected repository has this id.',
};

const KEY_FIELD = REQUEST_KEY_HEADER.toLowerCase();

describe('socketServiceApi', () => {
  let server: ScriptedServer;
  let api: ServiceApi;

  beforeEach(async () => {
    server = await startScriptedServer();
    api = socketServiceApi(server.socket);
  });

  afterEach(async () => {
    await server.close();
  });

  describe.each(ROUTES)('$name', (route) => {
    it(`should send ${route.method} ${route.url} and read its value`, async () => {
      server.answerWith({ status: route.status, body: route.value });

      await expect(route.call(api)).resolves.toEqual({
        outcome: 'answered',
        status: route.status,
        value: route.value,
      });
      const [received] = server.received;
      expect(server.received).toHaveLength(1);
      expect(received?.method).toBe(route.method);
      expect(received?.url).toBe(route.url);
      expect(received?.body).toBe(route.body);
    });

    it('should send JSON only with a body, and the key only with a command that starts work', async () => {
      server.answerWith({ status: route.status, body: route.value });

      await route.call(api);

      const headers = server.received[0]?.headers;
      expect(headers?.['content-type']).toBe(
        route.body === '' ? undefined : 'application/json',
      );
      expect(headers?.[KEY_FIELD]).toBe(route.key);
    });

    describe('when the service refuses', () => {
      it('should give the status and the error of the contract', async () => {
        server.answerWith({ status: 404, body: NOT_FOUND });

        await expect(route.call(api)).resolves.toEqual({
          outcome: 'refused',
          status: 404,
          error: NOT_FOUND,
        });
      });
    });

    describe('when the value does not match the schema of the route', () => {
      it('should throw a mismatch of the contract', async () => {
        server.answerWith({ status: route.status, body: { unknown: true } });

        await expect(route.call(api)).rejects.toThrow(ContractMismatchError);
      });
    });
  });

  describe('health', () => {
    it('should ask GET /health and read the health', async () => {
      server.answerWith({ status: 200, body: IDLE_HEALTH });

      await expect(api.health()).resolves.toEqual(IDLE_HEALTH);
      expect(
        server.received.map(({ method, url }) => `${method} ${url}`),
      ).toEqual(['GET /health']);
    });

    describe('when the answer is not a health', () => {
      it('should throw a mismatch of the contract, also for an error', async () => {
        server.answerWith({ status: 500, body: NOT_FOUND });

        await expect(api.health()).rejects.toThrow(ContractMismatchError);
      });
    });
  });

  describe('when an id holds characters of a path', () => {
    it('should send it escaped, as one part of the path', async () => {
      server.answerWith({ status: 200, body: SCANNED_REPOSITORY });

      await api.getRepository('example/payments ?#');

      expect(server.received[0]?.url).toBe(
        '/repositories/example%2Fpayments%20%3F%23',
      );
    });
  });

  describe('when a query leaves values out', () => {
    it('should send only the values that are there', async () => {
      server.answerWith({ status: 200, body: { items: [] } });

      await api.listImprovements({ status: 'awaiting_approval' });
      await api.listImprovements();

      expect(server.received.map(({ url }) => url)).toEqual([
        '/improvements?status=awaiting_approval',
        '/improvements',
      ]);
    });
  });

  describe('when a refusal does not carry the error of the contract', () => {
    it('should throw a mismatch of the contract', async () => {
      server.answerWith({ status: 404, body: SCANNED_REPOSITORY });

      await expect(api.getRepository('repository-1')).rejects.toThrow(
        ContractMismatchError,
      );
    });
  });

  describe('when a success carries an error', () => {
    it('should throw a mismatch of the contract', async () => {
      server.answerWith({ status: 200, body: NOT_FOUND });

      await expect(api.getRepository('repository-1')).rejects.toThrow(
        ContractMismatchError,
      );
    });
  });

  describe('when the body is not JSON', () => {
    it('should throw a mismatch of the contract', async () => {
      server.answerWith({ status: 502, text: '<html>Bad gateway</html>' });

      await expect(api.listRepositories()).rejects.toThrow(
        ContractMismatchError,
      );
    });
  });
});
