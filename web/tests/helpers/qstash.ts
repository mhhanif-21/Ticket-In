import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';

export const TEST_QSTASH_CURRENT_SIGNING_KEY = 'test_current';
export const TEST_QSTASH_NEXT_SIGNING_KEY = 'test_next';

export async function qstashSignature(body: string, key = TEST_QSTASH_CURRENT_SIGNING_KEY): Promise<string> {
  const bodyHash = createHash('sha256').update(body).digest('base64url');
  return new SignJWT({ body: bodyHash })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('Upstash')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(key));
}

export function configureTestQStashKeys(): void {
  process.env.QSTASH_CURRENT_SIGNING_KEY = TEST_QSTASH_CURRENT_SIGNING_KEY;
  process.env.QSTASH_NEXT_SIGNING_KEY = TEST_QSTASH_NEXT_SIGNING_KEY;
}
