import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { events } from '@/db/schema';
import { AppendEventGalleryAction, EventMediaUploadError } from '@/lib/actions/ReplaceEventMediaAction';
import { EventMediaValidationError } from '@/lib/events/eventMedia';

export const runtime = 'nodejs';

function isMediaFile(value: FormDataEntryValue): value is File {
  return typeof value === 'object'
    && 'arrayBuffer' in value
    && 'size' in value
    && 'name' in value;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (req.headers.get('x-user-role') !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, id)).limit(1);
    if (!event) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    const gallery = (await req.formData()).getAll('gallery').filter(isMediaFile);
    if (gallery.length === 0) {
      return NextResponse.json({
        status: 'error',
        code: 'MEDIA_FILE_MISSING',
        message: 'Pilih minimal satu foto galeri.',
      }, { status: 400 });
    }

    const result = await AppendEventGalleryAction.execute({ eventId: id, gallery });
    return NextResponse.json({ status: 'success', data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof EventMediaValidationError) {
      return NextResponse.json({ status: 'error', code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof EventMediaUploadError) {
      return NextResponse.json({ status: 'error', code: 'MEDIA_UPLOAD_FAILED', message: error.message }, { status: 502 });
    }
    console.error('event_gallery_upload_unavailable', { errorName: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({
      status: 'error',
      code: 'MEDIA_UPLOAD_UNAVAILABLE',
      message: 'Galeri acara sementara tidak tersedia. Silakan coba lagi.',
    }, { status: 503 });
  }
}
