import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventApprovalEmailTemplates, events, formFields } from '@/db/schema';
import {
  getUniqueFieldLabels,
  TicketTemplateValidationError,
  validateApprovalEmailTemplateTokens,
} from '@/lib/tickets/ticketTemplate';
import { isStaticRegistrationField } from '@/lib/validation/registrationForm';

export const runtime = 'nodejs';

async function getEmailContext(eventId: string) {
  const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return null;
  const fields = await db.select({ fieldName: formFields.fieldName }).from(formFields).where(eq(formFields.eventId, eventId));
  const [template] = await db
    .select({
      isActive: eventApprovalEmailTemplates.isActive,
      subject: eventApprovalEmailTemplates.subject,
      body: eventApprovalEmailTemplates.body,
    })
    .from(eventApprovalEmailTemplates)
    .where(eq(eventApprovalEmailTemplates.eventId, eventId))
    .limit(1);
  return {
    template,
    tokenLabels: getUniqueFieldLabels(fields.filter((field) => !isStaticRegistrationField(field.fieldName))),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
  }
  const { id } = await params;
  const context = await getEmailContext(id);
  if (!context) return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan.' }, { status: 404 });

  return NextResponse.json({
    status: 'success',
    data: {
      is_active: context.template?.isActive ?? false,
      subject: context.template?.subject ?? '',
      body: context.template?.body ?? '',
      token_options: ['NAME', 'EMAIL', 'EVENT_NAME', 'CODE', 'TICKET_IMAGE', ...context.tokenLabels],
    },
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const context = await getEmailContext(id);
    if (!context) return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan.' }, { status: 404 });
    const body = await request.json();
    const subject = typeof body.subject === 'string' ? body.subject : '';
    const content = typeof body.body === 'string' ? body.body : '';
    const isActive = body.is_active === true;

    if (isActive && (!subject.trim() || !content.trim())) {
      throw new TicketTemplateValidationError(
        'EMAIL_TEMPLATE_TOKEN_INVALID',
        422,
        'Subjek dan isi email wajib diisi saat template diaktifkan.',
      );
    }
    validateApprovalEmailTemplateTokens(subject, content, context.tokenLabels);

    const now = new Date();
    await db
      .insert(eventApprovalEmailTemplates)
      .values({ eventId: id, isActive, subject, body: content, updatedAt: now })
      .onConflictDoUpdate({
        target: eventApprovalEmailTemplates.eventId,
        set: { isActive, subject, body: content, updatedAt: now },
      });

    return NextResponse.json({ status: 'success', message: 'Template email berhasil disimpan.' });
  } catch (error) {
    if (error instanceof TicketTemplateValidationError) {
      return NextResponse.json({ status: 'error', code: error.code, message: error.message }, { status: error.status });
    }
    console.error('Approval email template save failed');
    return NextResponse.json({ status: 'error', message: 'Template email belum dapat disimpan. Silakan coba lagi.' }, { status: 500 });
  }
}
