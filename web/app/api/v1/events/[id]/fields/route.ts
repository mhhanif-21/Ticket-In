import { NextResponse } from 'next/server';
import { SaveCustomFormAction, FormFieldPayload } from '@/lib/actions/SaveCustomFormAction';
import { getAuthenticatedAdmin } from '@/lib/security/adminRoute';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedAdmin(req)) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    
    if (!body.fields || !Array.isArray(body.fields)) {
      return NextResponse.json({ status: 'error', message: 'Format payload tidak valid. Harap kirim array "fields"' }, { status: 400 });
    }

    const fieldsPayload: FormFieldPayload[] = body.fields;

    try {
      await SaveCustomFormAction.execute(id, fieldsPayload);
    } catch (validationError: any) {
      // 422 Unprocessable Entity
      return NextResponse.json({ status: 'error', message: validationError.message }, { status: 422 });
    }

    return NextResponse.json({ 
      status: 'success', 
      message: 'Form berhasil disimpan' 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error saving custom form:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
