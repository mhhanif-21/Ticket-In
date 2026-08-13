import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { supabaseAdmin } from '@/lib/supabase';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';

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

    // Convert File to ArrayBuffer to Buffer for supabase
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate using Magic Bytes (File Signatures) for high security
    const isJPEG = buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPNG = buffer.length > 7 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;

    if (!isJPEG && !isPNG) {
      return NextResponse.json({ status: 'error', message: 'Format file tidak valid, hanya menerima gambar JPG/PNG' }, { status: 400 });
    }

    // Set proper extension and content type based on true file signature
    const detectedExt = isJPEG ? 'jpg' : 'png';
    const detectedMime = isJPEG ? 'image/jpeg' : 'image/png';

    const fileName = `${id}-${Date.now()}.${detectedExt}`;
    const filePath = `${fileName}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKETS.eventPosters)
      .upload(filePath, buffer, {
        contentType: detectedMime,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload Error:', uploadError);
      return NextResponse.json({ status: 'error', message: 'Gagal mengunggah poster' }, { status: 500 });
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from(STORAGE_BUCKETS.eventPosters)
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
