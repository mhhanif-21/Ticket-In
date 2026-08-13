import { Receiver } from '@upstash/qstash';

export async function readVerifiedQStashBody(request: Request): Promise<string | null> {
  const signature = request.headers.get('Upstash-Signature');
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!signature || !currentSigningKey || !nextSigningKey) {
    return null;
  }

  const body = await request.text();
  const receiver = new Receiver({ currentSigningKey, nextSigningKey });

  try {
    return (await receiver.verify({ signature, body })) ? body : null;
  } catch {
    return null;
  }
}
