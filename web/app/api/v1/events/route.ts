import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';

export const runtime = 'nodejs';

// Helper to generate a slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export async function POST(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { name, capacity, registration_mode, location, date, description } = body;

    if (!name || !capacity || !location || !date) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate slug
    const baseSlug = generateSlug(name);
    let slug = baseSlug;
    let counter = 1;
    
    // Check if slug exists
    while (true) {
      const existing = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug));
      if (existing.length === 0) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Registration mode validation
    const mode = registration_mode || 'Auto-Accept'; // default mode
    if (mode !== 'Auto-Accept' && mode !== 'Manual Review') {
      return NextResponse.json(
        { status: 'error', message: 'Registration mode tidak valid' },
        { status: 400 }
      );
    }

    const [newEvent] = await db.insert(events).values({
      name,
      slug,
      capacity: parseInt(capacity, 10),
      location,
      date: new Date(date),
      description: description || null,
      registrationMode: mode,
      volunteerPinHash: '', // Dummy for now, generated in S3-T4
    }).returning();

    return NextResponse.json(
      { status: 'success', message: 'Event berhasil dibuat', data: newEvent },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    
    if (role === 'admin') {
      const allEvents = await db.select().from(events);
      return NextResponse.json({ status: 'success', data: allEvents });
    } else if (role === 'volunteer') {
      const eventId = req.headers.get('x-event-id');
      if (!eventId) {
        return NextResponse.json({ status: 'error', message: 'Event ID missing for volunteer' }, { status: 400 });
      }
      const myEvents = await db.select().from(events).where(eq(events.id, eventId));
      return NextResponse.json({ status: 'success', data: myEvents });
    } else {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }
  } catch (error: any) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
