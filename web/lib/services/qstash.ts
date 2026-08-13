/**
 * Upstash QStash Wrapper
 * ADR-001 / EHR-001: Background jobs dengan retry dasar
 */
import { Client } from '@upstash/qstash';

let qstashClient: Client | null = null;

export function getQStashClient(): Client {
  if (!qstashClient) {
    const token = process.env.QSTASH_TOKEN;
    const url = process.env.QSTASH_URL;
    if (!token) {
      throw new Error('QStash token is not defined in environment variables');
    }
    // Jika user mengaktifkan region spesifik (mis. US), QSTASH_URL perlu diset
    qstashClient = new Client({ token, baseUrl: url });
  }
  return qstashClient;
}

export interface JobPayload {
  url: string; // Target webhook URL
  body: any;
  retries?: number;
  delay?: string; // e.g. "10s", "1m"
}

export async function publishJob(payload: JobPayload) {
  const client = getQStashClient();
  
  return await client.publishJSON({
    url: payload.url,
    body: payload.body,
    retries: payload.retries ?? 3, // Default 3 retries sesuai EHR-001
    delay: payload.delay,
  });
}
