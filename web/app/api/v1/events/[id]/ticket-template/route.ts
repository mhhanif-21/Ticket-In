import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventTicketTemplates, events, formFields } from '@/db/schema';
import {
  getTicketTemplateConfig,
  getUniqueFieldLabels,
  parseTicketTemplateElements,
  TicketTemplateValidationError,
  validateTemplateFieldTokens,
} from '@/lib/tickets/ticketTemplate';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';
import { supabaseAdmin } from '@/lib/supabase';
import { isStaticRegistrationField } from '@/lib/validation/registrationForm';

export const runtime = 'nodejs';

function unauthorized() {
  return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
}

async function getEventAndTokenLabels(eventId: string) {
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return null;

  const fields = await db
    .select({ fieldName: formFields.fieldName })
    .from(formFields)
    .where(eq(formFields.eventId, eventId));
  return {
    event,
    tokenLabels: getUniqueFieldLabels(
      fields.filter((field) => !isStaticRegistrationField(field.fieldName)),
    ),
  };
}

function validationResponse(error: TicketTemplateValidationError) {
  return NextResponse.json({
    status: 'error',
    code: error.code,
    message: error.message,
  }, { status: error.status });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('x-user-role') !== 'admin') return unauthorized();

  const { id } = await params;
  const context = await getEventAndTokenLabels(id);
  if (!context) {
    return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan.' }, { status: 404 });
  }

  const template = await getTicketTemplateConfig(id);
  let backgroundUrl: string | null = null;
  if (template.backgroundPath) {
    const { data } = await supabaseAdmin.storage
      .from(STORAGE_BUCKETS.ticketTemplates)
      .createSignedUrl(template.backgroundPath, 60 * 60);
    backgroundUrl = data?.signedUrl ?? null;
  }

  return NextResponse.json({
    status: 'success',
    data: {
      mode: template.mode,
      background_url: backgroundUrl,
      elements: template.elements,
      // The editor exposes the four canonical elements. Legacy dynamic field
      // elements remain readable/renderable, but are not offered as new palette
      // options so a token cannot be accidentally duplicated.
      token_options: ['NAME', 'EMAIL', 'EVENT_NAME', 'CODE'],
    },
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('x-user-role') !== 'admin') return unauthorized();

  try {
    const { id } = await params;
    const context = await getEventAndTokenLabels(id);
    if (!context) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan.' }, { status: 404 });
    }

    const body = await request.json();
    const mode = body.mode === 'custom' ? 'custom' : body.mode === 'default' ? 'default' : null;
    if (!mode) {
      throw new TicketTemplateValidationError(
        'TICKET_TEMPLATE_ELEMENT_INVALID',
        422,
        'Konfigurasi template tidak valid.',
      );
    }

    const existing = await getTicketTemplateConfig(id);
    const elements = mode === 'custom' ? parseTicketTemplateElements(body.elements) : [];
    if (mode === 'custom') {
      if (!existing.backgroundPath) {
        throw new TicketTemplateValidationError(
          'TICKET_TEMPLATE_BACKGROUND_REQUIRED',
          422,
          'Unggah gambar latar sebelum mengaktifkan template kustom.',
        );
      }
      validateTemplateFieldTokens(elements, context.tokenLabels);
    }

    const now = new Date();
    await db
      .insert(eventTicketTemplates)
      .values({
        eventId: id,
        mode,
        backgroundPath: existing.backgroundPath,
        elements,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: eventTicketTemplates.eventId,
        set: { mode, elements, updatedAt: now },
      });

    return NextResponse.json({ status: 'success', message: 'Template tiket berhasil disimpan.' });
  } catch (error) {
    if (error instanceof TicketTemplateValidationError) return validationResponse(error);
    console.error('Ticket template save failed');
    return NextResponse.json(
      { status: 'error', message: 'Template tiket belum dapat disimpan. Silakan coba lagi.' },
      { status: 500 },
    );
  }
}
