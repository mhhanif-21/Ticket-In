import { NextResponse } from 'next/server';
import { db } from '@/db';
import { exportJobs, registrations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { readVerifiedQStashBody } from '@/lib/security/qstash';

function toCSV(data: any[]) {
  if (data.length === 0) return '';

  // Extract all unique headers including custom ones
  const headerSet = new Set<string>();
  data.forEach(row => Object.keys(row).forEach(k => headerSet.add(k)));
  const headers = Array.from(headerSet);

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

    // Update job to processing
    await db.update(exportJobs).set({ status: 'processing' }).where(eq(exportJobs.id, job_id));

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

      let customAnswers = {};
      if (reg.answers && typeof reg.answers === 'object') {
        customAnswers = reg.answers;
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
    }).where(eq(exportJobs.id, job_id));

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Export worker error:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
