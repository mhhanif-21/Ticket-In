import { NextResponse } from 'next/server';
import { db } from '@/db';
import { exportJobs, registrations } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { readVerifiedQStashBody } from '@/lib/security/qstash';

const STANDARD_HEADERS = ['ID', 'Name', 'Email', 'Status', 'Ticket Code', 'Presence', 'Registered At'];

function toCSV(data: Record<string, unknown>[]) {
  if (data.length === 0) return '';

  // Menjaga seluruh kolom standar tetap stabil lalu menambahkan custom header terurut.
  const customHeaders = Array.from(new Set(
    data.flatMap((row) => Object.keys(row).filter((header) => !STANDARD_HEADERS.includes(header)))
  )).sort((left, right) => left.localeCompare(right));
  const headers = [...STANDARD_HEADERS, ...customHeaders];

  const rows = data.map(row =>
    headers.map(header => JSON.stringify(row[header] ?? '')).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export async function POST(request: Request) {
  try {
    const rawBody = await readVerifiedQStashBody(request);
    if (!rawBody) {
      return NextResponse.json({ error: 'Unauthorized webhook call' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const { job_id, event_id } = body;

    if (!job_id || !event_id) {
      return NextResponse.json({ error: 'Missing job_id or event_id' }, { status: 400 });
    }

    // Job harus dimiliki event payload sebelum state atau data event mana pun dimutasi.
    const [job] = await db
      .select()
      .from(exportJobs)
      .where(and(eq(exportJobs.id, job_id), eq(exportJobs.eventId, event_id)))
      .limit(1);

    if (!job) {
      return NextResponse.json({ error: 'Export job tidak ditemukan untuk event ini' }, { status: 404 });
    }

    if (job.status === 'completed') {
      return NextResponse.json({ status: 'success', data: { job_id, status: job.status } });
    }

    const [claimedJob] = await db
      .update(exportJobs)
      .set({ status: 'processing' })
      .where(and(
        eq(exportJobs.id, job_id),
        eq(exportJobs.eventId, event_id),
        eq(exportJobs.status, 'pending'),
      ))
      .returning({ id: exportJobs.id });

    if (!claimedJob) {
      return NextResponse.json({ status: 'success', data: { job_id, status: job.status } });
    }

    // Fetch registrations
    const regs = await db.select().from(registrations).where(eq(registrations.eventId, event_id));

    // Flatten custom answers
    const flattenedData = regs.map(reg => {
      const base = {
        'ID': reg.id,
        'Name': reg.name,
        'Email': reg.email,
        'Status': reg.status,
        'Ticket Code': reg.ticketCode,
        'Presence': reg.presenceStatus,
        'Registered At': reg.createdAt.toISOString()
      };

      const customAnswers: Record<string, unknown> = {};
      if (reg.answers && typeof reg.answers === 'object') {
        for (const [label, value] of Object.entries(reg.answers as Record<string, unknown>)) {
          customAnswers[`Custom: ${label}`] = value;
        }
      }

      return { ...base, ...customAnswers };
    });

    const csvString = toCSV(flattenedData);

    // Using Data URL for MVP to avoid external storage dependency overhead.
    const base64Csv = Buffer.from(csvString).toString('base64');
    const fileUrl = `data:text/csv;base64,${base64Csv}`;

    // Update job to completed
    await db.update(exportJobs).set({
      status: 'completed',
      fileUrl: fileUrl
    }).where(and(eq(exportJobs.id, job_id), eq(exportJobs.eventId, event_id), eq(exportJobs.status, 'processing')));

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Export worker error:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
