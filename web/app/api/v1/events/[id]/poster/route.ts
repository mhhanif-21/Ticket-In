import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    
    // Check if event exists
    const [existing] = await db.select().from(events).where(eq(events.id, id));
    if (!existing) {
      return NextResponse.json({ status: 'error', message: 'Event tidak ditemukan' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('poster') as File | null;

    if (!file) {
      return NextResponse.json({ status: 'error', message: 'File poster tidak ditemukan' }, { status: 400 });
    }

    // Validate type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ status: 'error', message: 'File harus berupa gambar' }, { status: 400 });
    }

    // Convert File to ArrayBuffer to Buffer for supabase
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${id}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('posters')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload Error:', uploadError);
      return NextResponse.json({ status: 'error', message: 'Gagal mengunggah poster' }, { status: 500 });
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('posters')
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    // Update event in DB
    const [updatedEvent] = await db.update(events).set({
      posterUrl: publicUrl,
      updatedAt: new Date()
    }).where(eq(events.id, id)).returning();

    return NextResponse.json({ 
      status: 'success', 
      message: 'Poster berhasil diunggah', 
      data: updatedEvent 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error uploading poster:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
