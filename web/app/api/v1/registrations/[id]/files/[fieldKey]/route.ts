import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { participantFileUploads, registrations } from '@/db/schema';
import { getAuthenticatedAdmin } from '@/lib/security/adminRoute';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; fieldKey: string }> }) {
  if (!await getAuthenticatedAdmin(request)) {
    return NextResponse.json({ status: 'error', code: 'REGISTRATION_FILE_ACCESS_DENIED', message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { id: registrationId, fieldKey } = await params;
    const [registration] = await db
      .select({ answers: registrations.answers })
      .from(registrations)
      .where(eq(registrations.id, registrationId))
      .limit(1);
    const answers = asRecord(registration?.answers);
    const answer = answers ? asRecord(answers[fieldKey]) : null;
    const storagePath = typeof answer?.path === 'string' ? answer.path : null;
    const fileName = typeof answer?.fileName === 'string' ? answer.fileName : null;
    if (!storagePath || !fileName) {
      return NextResponse.json({ status: 'error', code: 'REGISTRATION_FILE_NOT_FOUND', message: 'Berkas tidak ditemukan.' }, { status: 404 });
    }

    const [claimedUpload] = await db
      .select({ bucket: participantFileUploads.bucket })
      .from(participantFileUploads)
      .where(and(
        eq(participantFileUploads.registrationId, registrationId),
        eq(participantFileUploads.fieldKey, fieldKey),
        eq(participantFileUploads.storagePath, storagePath),
        eq(participantFileUploads.status, 'claimed'),
      ))
      .limit(1);
    if (!claimedUpload) {
      return NextResponse.json({ status: 'error', code: 'REGISTRATION_FILE_NOT_FOUND', message: 'Berkas tidak ditemukan.' }, { status: 404 });
    }

    const expiresInSeconds = 5 * 60;
    const { data, error } = await supabaseAdmin.storage
      .from(claimedUpload.bucket)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) {
      console.error('Registration file signed URL failed', { registrationId, fieldKey });
      return NextResponse.json(
        { status: 'error', message: 'Berkas belum dapat dibuka. Silakan coba lagi.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      status: 'success',
      data: {
        file_name: fileName,
        url: data.signedUrl,
        expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      },
    });
  } catch {
    console.error('Registration file access failed');
    return NextResponse.json({ status: 'error', message: 'Berkas belum dapat dibuka. Silakan coba lagi.' }, { status: 500 });
  }
}
