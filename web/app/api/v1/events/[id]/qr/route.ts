import QRCode from 'qrcode';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';

function publicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventSlug } = await params;
  const [event] = await db.select({ slug: events.slug }).from(events).where(eq(events.slug, eventSlug)).limit(1);

  if (!event) {
    return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
  }

  // BUG-B FIX: QR mengarah ke landing page event, bukan langsung ke form registrasi
  const registrationUrl = `${publicAppUrl()}/${event.slug}`;
  const image = await QRCode.toBuffer(registrationUrl, { type: 'png', errorCorrectionLevel: 'M' });

  return new NextResponse(new Uint8Array(image), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
