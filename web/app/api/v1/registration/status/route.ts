import { getPublicRegistrationStatusResponse } from '@/lib/registration/publicStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    return await getPublicRegistrationStatusResponse(request);
  } catch (error) {
    console.error('Error in check status API:', error);
    return Response.json({ status: 'error', message: 'Terjadi kesalahan internal' }, { status: 500 });
  }
}
