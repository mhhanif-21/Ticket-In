import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { eventTicketTemplates, events } from '@/db/schema';
import {
  activateHeldStorageCleanupJobs,
  holdStorageCleanupJobs,
  queueStorageCleanupJobsTx,
  releaseHeldStorageCleanupJobsTx,
} from '@/lib/storage/cleanupLifecycle';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';
import { supabaseAdmin } from '@/lib/supabase';
import {
  TicketTemplateValidationError,
  validateTicketTemplateBackground,
} from '@/lib/tickets/ticketTemplate';

export const runtime = 'nodejs';

function responseForValidation(error: TicketTemplateValidationError) {
  return NextResponse.json({ status: 'error', code: error.code, message: error.message }, { status: error.status });
}

function fileExtension(mimeType: 'image/jpeg' | 'image/png' | 'image/webp'): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  return 'webp';
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
  }

  let stagedObject: { bucket: string; storagePath: string; reason: 'ticket_template_replace' } | null = null;
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
    stagedObject = {
      bucket: STORAGE_BUCKETS.ticketTemplates,
      storagePath: `${id}/background/${randomUUID()}.${fileExtension(background.mimeType)}`,
      reason: 'ticket_template_replace',
    };
    await holdStorageCleanupJobs([stagedObject]);

    const { error } = await supabaseAdmin.storage
      .from(stagedObject.bucket)
      .upload(stagedObject.storagePath, background.bytes, {
        contentType: background.mimeType,
        upsert: false,
      });
    if (error) {
      console.error('Ticket template background upload failed', { eventId: id, status: error.statusCode });
      throw new Error('ticket_template_storage_upload_failed');
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      const [lockedEvent] = await tx
        .select({ id: events.id })
        .from(events)
        .where(eq(events.id, id))
        .for('update')
        .limit(1);
      if (!lockedEvent) throw new Error('ticket_template_event_missing');

      const [existing] = await tx
        .select({ backgroundPath: eventTicketTemplates.backgroundPath })
        .from(eventTicketTemplates)
        .where(eq(eventTicketTemplates.eventId, id))
        .for('update')
        .limit(1);

      await tx
        .insert(eventTicketTemplates)
        .values({ eventId: id, backgroundPath: stagedObject!.storagePath, updatedAt: now })
        .onConflictDoUpdate({
          target: eventTicketTemplates.eventId,
          set: { backgroundPath: stagedObject!.storagePath, updatedAt: now },
        });

      await releaseHeldStorageCleanupJobsTx(tx, [stagedObject!]);
      if (existing?.backgroundPath && existing.backgroundPath !== stagedObject!.storagePath) {
        await queueStorageCleanupJobsTx(tx, [{
          bucket: STORAGE_BUCKETS.ticketTemplates,
          storagePath: existing.backgroundPath,
          reason: 'ticket_template_replace',
        }]);
      }
    });

    const { data } = await supabaseAdmin.storage
      .from(STORAGE_BUCKETS.ticketTemplates)
      .createSignedUrl(stagedObject.storagePath, 60 * 60);
    return NextResponse.json({ status: 'success', data: { background_url: data?.signedUrl ?? null } });
  } catch (error) {
    if (stagedObject) {
      await activateHeldStorageCleanupJobs([stagedObject]).catch(() => undefined);
    }
    if (error instanceof TicketTemplateValidationError) return responseForValidation(error);
    console.error('Ticket template background request failed', {
      error: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { status: 'error', message: 'Gambar template belum dapat diunggah. Silakan coba lagi.' },
      { status: 500 },
    );
  }
}
