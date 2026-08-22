import QRCode from 'qrcode';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getCanonicalBaseUrl } from '@/lib/security/url';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventSlug } = await params;
  const [event] = await db
    .select({ slug: events.slug })
    .from(events)
    .where(and(eq(events.slug, eventSlug), eq(events.status, 'Published')))
    .limit(1);

  if (!event) {
    return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
  }

  const baseUrl = getCanonicalBaseUrl(request);
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
