import QRCode from 'qrcode';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

function resolvePublicUrl(request: Request): string {
  // Fix QR 401: Jika NEXT_PUBLIC_APP_URL tidak di-set di Vercel,
  // fallback ke Host header dari request sehingga URL selalu valid di environment manapun
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  const host = request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventSlug } = await params;
  const [event] = await db.select({ slug: events.slug }).from(events).where(eq(events.slug, eventSlug)).limit(1);

  if (!event) {
    return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
  }

  const baseUrl = resolvePublicUrl(request);
  const registrationUrl = `${baseUrl}/${event.slug}`;
  const image = await QRCode.toBuffer(registrationUrl, { type: 'png', errorCorrectionLevel: 'M' });

  return new NextResponse(new Uint8Array(image), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
