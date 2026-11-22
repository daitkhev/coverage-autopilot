import { describe, expect, it } from 'vitest';

import {
  getRequest,
  pathOf,
  postRequest,
  wireOf,
  withQuery,
} from '#api/route-requests';

const KEY = 'key-1';

describe('pathOf', () => {
  it('should join the parts, each escaped', () => {
    expect(pathOf('repositories', 'a/b c?', 'scans')).toBe(
      '/repositories/a%2Fb%20c%3F/scans',
    );
  });
});

describe('withQuery', () => {
  it('should add the values that are there, and leave the others out', () => {
    expect(
      withQuery('/files', { below: 80, metric: undefined, state: 'measured' }),
    ).toBe('/files?below=80&state=measured');
  });

  it('should escape a value', () => {
    expect(withQuery('/improvements', { filePath: 'src/a b&c.ts' })).toBe(
      '/improvements?filePath=src%2Fa+b%26c.ts',
    );
  });

  describe('when no value is there', () => {
    it('should give the path alone', () => {
      expect(withQuery('/files', { below: undefined })).toBe('/files');
      expect(withQuery('/files')).toBe('/files');
    });
  });
});

describe('getRequest', () => {
  it('should ask for the path, with no body', () => {
    expect(getRequest('/health')).toEqual({ method: 'GET', path: '/health' });
  });
});

describe('postRequest', () => {
  it('should send to the path what it is given, and nothing else', () => {
    expect(postRequest('/scans/1/cancel')).toEqual({
      method: 'POST',
      path: '/scans/1/cancel',
    });
    expect(postRequest('/improvements', { body: { a: 1 }, key: KEY })).toEqual({
      method: 'POST',
      path: '/improvements',
      body: { a: 1 },
      key: KEY,
    });
  });
});

describe('wireOf', () => {
  describe('when the request has a body', () => {
    it('should send it as JSON, with its length in bytes', () => {
      expect(wireOf(postRequest('/x', { body: { name: 'é' } }))).toEqual({
        method: 'POST',
        path: '/x',
        headers: {
          'content-type': 'application/json',
          'content-length': '13',
        },
        payload: '{"name":"é"}',
      });
    });
  });

  describe('when the request has no body', () => {
    it('should send no payload and no header of one', () => {
      expect(wireOf(postRequest('/x'))).toEqual({
        method: 'POST',
        path: '/x',
        headers: {},
        payload: undefined,
      });
    });
  });

  describe('when the request carries a key', () => {
    it('should send it in the header of the contract', () => {
      expect(wireOf(postRequest('/x', { key: KEY })).headers).toEqual({
        'Idempotency-Key': KEY,
      });
    });
  });
});
