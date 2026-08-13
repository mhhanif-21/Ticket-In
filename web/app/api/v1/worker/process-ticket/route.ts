import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { GenerateTicketAction } from '../../../../../lib/actions/ticket';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('Upstash-Signature');
    
    let rawBody = '';
    
    if (process.env.NODE_ENV !== 'test') {
      if (!signature) {
        return NextResponse.json({ message: 'Missing Upstash-Signature header' }, { status: 401 });
      }

      const receiver = new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || 'test_current',
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || 'test_next',
      });

      rawBody = await req.text();
      
      try {
        const isValid = await receiver.verify({
          signature,
          body: rawBody,
        });

        if (!isValid) {
          return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
        }
      } catch (err: any) {
        console.error('Signature verification failed:', err.message);
        return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
      }
    } else {
      // In test env, just read text if needed
      rawBody = await req.text();
    }

    const payload = JSON.parse(rawBody);
    const { registration_id } = payload;

    if (!registration_id) {
      return NextResponse.json({ message: 'registration_id is required' }, { status: 400 });
    }

    // LLD-WRK-001: Panggil orchestrator logic tiket
    await GenerateTicketAction(registration_id);

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error: any) {
    console.error('QStash Webhook Error:', error);
    
    // Mengembalikan status 500 jika terjadi kegagalan sistem agar QStash melakukan retry (EHR-001)
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
