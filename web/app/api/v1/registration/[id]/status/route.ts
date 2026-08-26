import { NextResponse } from 'next/server';
import { getPublicRegistrationStatusResponse } from '@/lib/registration/publicStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const id = params.id;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ status: 'error', message: 'Data Tidak Ditemukan' }, { status: 404 });
    }

    return await getPublicRegistrationStatusResponse(request, id);

  } catch (error) {
    console.error('Error in polling API:', error);
    return NextResponse.json({ status: 'error', message: 'Terjadi kesalahan internal' }, { status: 500 });
  }
}
