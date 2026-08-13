import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';
import { POST as exportWorkerPost } from '../../app/api/v1/worker/export/route';
import { configureTestQStashKeys, qstashSignature } from '../helpers/qstash';

describe('BUG-007 QStash worker boundary', () => {
  beforeEach(() => {
    configureTestQStashKeys();
  });

  it('lets worker requests reach route handlers without an application JWT', async () => {
    const response = await middleware(new NextRequest('http://localhost/api/v1/worker/process-ticket', { method: 'POST' }));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects export worker requests without a QStash signature', async () => {
    const response = await exportWorkerPost(new Request('http://localhost/api/v1/worker/export', { method: 'POST', body: JSON.stringify({}) }));
    expect(response.status).toBe(401);
  });

  it('accepts a verified QStash request through the export worker boundary', async () => {
    const body = JSON.stringify({});
    const response = await exportWorkerPost(new Request('http://localhost/api/v1/worker/export', {
      method: 'POST',
      headers: { 'Upstash-Signature': await qstashSignature(body) },
      body,
    }));
    expect(response.status).toBe(400);
  });
});
