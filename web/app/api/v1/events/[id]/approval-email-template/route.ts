import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventApprovalEmailTemplates, events, formFields } from '@/db/schema';
import {
  getEmailTemplateTokenOptions,
  getUniqueFieldLabels,
  isEmailTemplateKind,
  normalizeEmailTemplateContent,
  type EmailTemplateKind,
  TicketTemplateValidationError,
  validateApprovalEmailTemplateTokens,
} from '@/lib/tickets/ticketTemplate';
import { isStaticRegistrationField } from '@/lib/validation/registrationForm';

export const runtime = 'nodejs';

function parseKind(value: unknown): EmailTemplateKind {
  if (value === undefined || value === null || value === '') return 'ticket';
  if (!isEmailTemplateKind(value)) {
    throw new TicketTemplateValidationError(
      'EMAIL_TEMPLATE_KIND_INVALID',
      422,
      'Jenis template email tidak valid.',
    );
  }
  return value;
}

async function getEmailContext(eventId: string, kind: EmailTemplateKind) {
  const [event] = await db
    .select({ id: events.id, registrationMode: events.registrationMode })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return null;

  const [template] = await db
    .select({
      isActive: eventApprovalEmailTemplates.isActive,
      subject: eventApprovalEmailTemplates.subject,
      body: eventApprovalEmailTemplates.body,
    })
    .from(eventApprovalEmailTemplates)
    .where(and(
      eq(eventApprovalEmailTemplates.eventId, eventId),
      eq(eventApprovalEmailTemplates.templateKind, kind),
    ))
    .limit(1);

  const fields = kind === 'ticket'
    ? await db.select({ fieldName: formFields.fieldName }).from(formFields).where(eq(formFields.eventId, eventId))
    : [];

  return {
    event,
    template,
    tokenLabels: getUniqueFieldLabels(fields.filter((field) => !isStaticRegistrationField(field.fieldName))),
  };
}

function unsupportedForAutoAccept() {
  return NextResponse.json({
    status: 'error',
    code: 'EMAIL_TEMPLATE_MODE_UNSUPPORTED',
    message: 'Template email kustom hanya tersedia untuk event Manual Review.',
  }, { status: 409 });
}

function validationResponse(error: TicketTemplateValidationError) {
  return NextResponse.json({
    status: 'error',
    code: error.code,
    message: error.message,
  }, { status: error.status });
}

function getKindFromRequest(request: Request): EmailTemplateKind {
  return parseKind(new URL(request.url).searchParams.get('kind'));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const kind = getKindFromRequest(request);
    const context = await getEmailContext(id, kind);
    if (!context) return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan.' }, { status: 404 });
    if (context.event.registrationMode !== 'Manual Review') return unsupportedForAutoAccept();

    const templateContent = context.template
      ? normalizeEmailTemplateContent(kind, context.template.subject, context.template.body)
      : { subject: '', body: '' };

    return NextResponse.json({
      status: 'success',
      data: {
        kind,
        is_active: context.template?.isActive ?? false,
        subject: templateContent.subject,
        body: templateContent.body,
        token_options: getEmailTemplateTokenOptions(kind),
      },
    });
  } catch (error) {
    if (error instanceof TicketTemplateValidationError) return validationResponse(error);
    console.error('Approval email template load failed');
    return NextResponse.json({ status: 'error', message: 'Template email belum dapat dimuat.' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const kind = parseKind(body.kind ?? getKindFromRequest(request));
    const context = await getEmailContext(id, kind);
    if (!context) return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan.' }, { status: 404 });
    if (context.event.registrationMode !== 'Manual Review') return unsupportedForAutoAccept();

    const isActive = body.is_active === true;
    const subject = typeof body.subject === 'string' ? body.subject : '';
    const content = typeof body.body === 'string' ? body.body : '';
    const normalized = normalizeEmailTemplateContent(kind, subject, content);

    if (isActive && (!normalized.subject.trim() || !normalized.body.trim())) {
      throw new TicketTemplateValidationError(
        'EMAIL_TEMPLATE_TOKEN_INVALID',
        422,
        'Subjek dan isi email wajib diisi saat template diaktifkan.',
      );
    }
    if (isActive) {
      validateApprovalEmailTemplateTokens(
        normalized.subject,
        normalized.body,
        context.tokenLabels,
        kind,
      );
    }

    const now = new Date();
    await db
      .insert(eventApprovalEmailTemplates)
      .values({
        eventId: id,
        templateKind: kind,
        isActive,
        // Off only changes activation state; stored content is preserved by
        // the conflict update below. Empty values are used only for a new row.
        subject: isActive ? normalized.subject : '',
        body: isActive ? normalized.body : '',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [eventApprovalEmailTemplates.eventId, eventApprovalEmailTemplates.templateKind],
        set: isActive
          ? { isActive, subject: normalized.subject, body: normalized.body, updatedAt: now }
          : { isActive, updatedAt: now },
      });

    return NextResponse.json({ status: 'success', message: 'Template email berhasil disimpan.' });
  } catch (error) {
    if (error instanceof TicketTemplateValidationError) return validationResponse(error);
    console.error('Approval email template save failed');
    return NextResponse.json({ status: 'error', message: 'Template email belum dapat disimpan. Silakan coba lagi.' }, { status: 500 });
  }
}
