import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { events } from '@/db/schema';
import { ReplaceEventMediaAction, EventMediaUploadError } from '@/lib/actions/ReplaceEventMediaAction';
import { EventMediaValidationError } from '@/lib/events/eventMedia';

export const runtime = 'nodejs';

function isMediaFile(value: FormDataEntryValue | null): value is File {
  return value !== null
    && typeof value === 'object'
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

    const formData = await req.formData();
    const cover = formData.get('cover');
    const gallery = formData.getAll('gallery').filter(isMediaFile);
    if (!isMediaFile(cover)) {
      return NextResponse.json({
        status: 'error',
        code: 'MEDIA_FILE_MISSING',
        message: 'Poster acara wajib diunggah.',
      }, { status: 400 });
    }

    const result = await ReplaceEventMediaAction.execute({
      eventId: id,
      cover,
      gallery,
      replaceGallery: formData.get('replace_gallery') === 'true',
    });

    return NextResponse.json({
      status: 'success',
      message: 'Media acara berhasil diperbarui',
      data: result,
    });
  } catch (error) {
    if (error instanceof EventMediaValidationError) {
      return NextResponse.json({ status: 'error', code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof EventMediaUploadError) {
      return NextResponse.json({ status: 'error', code: 'MEDIA_UPLOAD_FAILED', message: error.message }, { status: 502 });
    }

    console.error('Event media route failed', { error: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}
