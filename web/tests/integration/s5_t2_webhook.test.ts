import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../../app/api/v1/worker/process-ticket/route';
import * as ticketActions from '../../lib/actions/ticket';
import { NextRequest } from 'next/server';
import { configureTestQStashKeys, qstashSignature } from '../helpers/qstash';

describe('S5-T2 QStash Webhook Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureTestQStashKeys();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should reject request without signature in production/development env', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    
    const req = new NextRequest('http://localhost:3000/api/v1/worker/process-ticket', {
      method: 'POST',
      body: JSON.stringify({ registration_id: '123' })
    });
    // Missing Upstash-Signature header

    const res = await POST(req);
    expect(res.status).toBe(401);
    
    const json = await res.json();
    expect(json.message).toContain('Unauthorized webhook call');
  });

  it('should return 400 if registration_id is missing', async () => {
    const body = JSON.stringify({});
    const req = new NextRequest('http://localhost:3000/api/v1/worker/process-ticket', {
      method: 'POST',
      headers: { 'Upstash-Signature': await qstashSignature(body) },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should orchestrate GenerateTicketAction and return 200 on success', async () => {
    const generateSpy = vi.spyOn(ticketActions, 'GenerateTicketAction').mockResolvedValue({
      status: 'success',
      message: 'Triggered',
      ticketCode: 'TEST1234',
      qrCodeUrl: 'https://example.test/qr.png',
    });

    const body = JSON.stringify({ registration_id: '00000000-0000-4000-8000-000000000456' });
    const req = new NextRequest('http://localhost:3000/api/v1/worker/process-ticket', {
      method: 'POST',
      headers: { 'Upstash-Signature': await qstashSignature(body) },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(generateSpy).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000456');
  });

  it('should return 500 when GenerateTicketAction throws an error to trigger QStash retry', async () => {
    const generateSpy = vi.spyOn(ticketActions, 'GenerateTicketAction').mockRejectedValue(new Error('Database timeout simulation'));

    const body = JSON.stringify({ registration_id: '00000000-0000-4000-8000-000000000789' });
    const req = new NextRequest('http://localhost:3000/api/v1/worker/process-ticket', {
      method: 'POST',
      headers: { 'Upstash-Signature': await qstashSignature(body) },
      body,
    });

    const res = await POST(req);
    
    // Harus 500 agar QStash retry
    expect(res.status).toBe(500);
    
    const json = await res.json();
    expect(json.message).toBe('Database timeout simulation');
  });
});
