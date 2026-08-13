import { NextRequest, NextResponse } from 'next/server';
import { GenerateTicketAction } from '../../../../../lib/actions/ticket';
import { readVerifiedQStashBody } from '@/lib/security/qstash';
import {
  ensureTicketGenerationJob,
  getTicketGenerationJob,
  markTicketGenerationJobCompleted,
  markTicketGenerationJobFailed,
  registrationIsAccepted,
} from '@/lib/actions/ticketGenerationJob';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let registrationId: string | null = null;
  try {
    const rawBody = await readVerifiedQStashBody(req);
    if (!rawBody) {
      return NextResponse.json({ message: 'Unauthorized webhook call' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const { registration_id } = payload;

    if (!registration_id) {
      return NextResponse.json({ message: 'registration_id is required' }, { status: 400 });
    }
    registrationId = registration_id;

    // Legacy/manual deliveries may not have a job row; accepted registrations are
    // backfilled before processing so every current worker run is observable.
    let job = await getTicketGenerationJob(registration_id);
    if (!job && await registrationIsAccepted(registration_id)) {
      job = await ensureTicketGenerationJob(registration_id);
    }

    // LLD-WRK-001: Panggil orchestrator logic tiket. Duplicate delivery is safe.
    await GenerateTicketAction(registration_id);
    if (job) await markTicketGenerationJobCompleted(registration_id);

    return NextResponse.json({ status: 'success', data: { jobStatus: job ? 'completed' : null } }, { status: 200 });
  } catch (error: any) {
    console.error('QStash Webhook Error:', error);
    try {
      if (registrationId) await markTicketGenerationJobFailed(registrationId, error);
    } catch (jobError) {
      console.error('Unable to persist ticket job failure:', jobError);
    }
    
    // Mengembalikan status 500 jika terjadi kegagalan sistem agar QStash melakukan retry (EHR-001)
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
