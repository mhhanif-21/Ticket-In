import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventTicketTemplates, events } from '@/db/schema';
import {
  TicketTemplateValidationError,
  validateTicketTemplateBackground,
} from '@/lib/tickets/ticketTemplate';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

function responseForValidation(error: TicketTemplateValidationError) {
  return NextResponse.json({ status: 'error', code: error.code, message: error.message }, { status: error.status });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, id)).limit(1);
    if (!event) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan.' }, { status: 404 });
    }

    const formData = await request.formData();
    const candidate = formData.get('background');
    if (!(candidate instanceof File)) {
      throw new TicketTemplateValidationError(
        'TICKET_TEMPLATE_BACKGROUND_REQUIRED',
        422,
        'Pilih gambar latar template terlebih dahulu.',
      );
    }
    const background = await validateTicketTemplateBackground(candidate);
    const storagePath = `${id}/background`;
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKETS.ticketTemplates)
      .upload(storagePath, background.bytes, { contentType: background.mimeType, upsert: true });
    if (error) {
      console.error('Ticket template background upload failed', { eventId: id, status: error.statusCode });
      return NextResponse.json(
        { status: 'error', code: 'TICKET_TEMPLATE_UPLOAD_FAILED', message: 'Gambar template belum dapat diunggah. Silakan coba lagi.' },
        { status: 502 },
      );
    }

    const now = new Date();
    await db
      .insert(eventTicketTemplates)
      .values({ eventId: id, backgroundPath: storagePath, updatedAt: now })
      .onConflictDoUpdate({
        target: eventTicketTemplates.eventId,
        set: { backgroundPath: storagePath, updatedAt: now },
      });

    const { data } = await supabaseAdmin.storage
      .from(STORAGE_BUCKETS.ticketTemplates)
      .createSignedUrl(storagePath, 60 * 60);
    return NextResponse.json({ status: 'success', data: { background_url: data?.signedUrl ?? null } });
  } catch (error) {
    if (error instanceof TicketTemplateValidationError) return responseForValidation(error);
    console.error('Ticket template background request failed');
    return NextResponse.json(
      { status: 'error', message: 'Gambar template belum dapat diunggah. Silakan coba lagi.' },
      { status: 500 },
    );
  }
}
