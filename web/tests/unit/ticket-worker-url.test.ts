import { afterEach, describe, expect, it } from 'vitest';
import { getTicketWorkerUrl } from '../../lib/actions/ticketGenerationJob';

const originalNextUrl = process.env.NEXT_URL;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalVercelUrl = process.env.VERCEL_URL;

afterEach(() => {
  if (originalNextUrl === undefined) delete process.env.NEXT_URL;
  else process.env.NEXT_URL = originalNextUrl;
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
  else process.env.VERCEL_URL = originalVercelUrl;
});

describe('ticket worker URL', () => {
  it('prefers the explicitly configured deployment URL', () => {
    process.env.NEXT_URL = 'https://preview.example.test/';
    process.env.NEXT_PUBLIC_APP_URL = 'https://old.example.test';

    expect(getTicketWorkerUrl()).toBe('https://preview.example.test/api/v1/worker/process-ticket');
  });

  it('falls back to Vercel deployment URL when no explicit URL is configured', () => {
    delete process.env.NEXT_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = 'deployment.example.test';

    expect(getTicketWorkerUrl()).toBe('https://deployment.example.test/api/v1/worker/process-ticket');
  });
});
