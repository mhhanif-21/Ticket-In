import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../../app/api/v1/worker/process-ticket/route';
import * as ticketActions from '../../lib/actions/ticket';
import { NextRequest } from 'next/server';

describe('S5-T2 QStash Webhook Endpoint', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should reject request without signature in production/development env', async () => {
    process.env.NODE_ENV = 'production';
    
    const req = new NextRequest('http://localhost:3000/api/v1/worker/process-ticket', {
      method: 'POST',
      body: JSON.stringify({ registration_id: '123' })
    });
    // Missing Upstash-Signature header

    const res = await POST(req);
    expect(res.status).toBe(401);
    
    const json = await res.json();
    expect(json.message).toContain('Missing Upstash-Signature');
  });

  it('should return 400 if registration_id is missing', async () => {
    process.env.NODE_ENV = 'test';
    
    const req = new NextRequest('http://localhost:3000/api/v1/worker/process-ticket', {
      method: 'POST',
      body: JSON.stringify({}) // missing registration_id
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should orchestrate GenerateTicketAction and return 200 on success', async () => {
    process.env.NODE_ENV = 'test';
    
    const generateSpy = vi.spyOn(ticketActions, 'GenerateTicketAction').mockResolvedValue({ status: 'success', message: 'Triggered' });

    const req = new NextRequest('http://localhost:3000/api/v1/worker/process-ticket', {
      method: 'POST',
      body: JSON.stringify({ registration_id: 'reg-456' })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(generateSpy).toHaveBeenCalledWith('reg-456');
  });

  it('should return 500 when GenerateTicketAction throws an error to trigger QStash retry', async () => {
    process.env.NODE_ENV = 'test';
    
    const generateSpy = vi.spyOn(ticketActions, 'GenerateTicketAction').mockRejectedValue(new Error('Database timeout simulation'));

    const req = new NextRequest('http://localhost:3000/api/v1/worker/process-ticket', {
      method: 'POST',
      body: JSON.stringify({ registration_id: 'reg-789' })
    });

    const res = await POST(req);
    
    // Harus 500 agar QStash retry
    expect(res.status).toBe(500);
    
    const json = await res.json();
    expect(json.message).toBe('Database timeout simulation');
  });
});
