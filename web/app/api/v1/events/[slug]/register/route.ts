import { NextRequest, NextResponse } from 'next/server';
import { processRegistrationAction } from '@/lib/actions/processRegistrationAction';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const slug = params.slug;
    
    // Check if it's multipart/form-data
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ status: 'error', message: 'Mesti multipart/form-data' }, { status: 400 });
    }

    const formData = await req.formData();
    
    let name = formData.get('name') as string;
    let email = formData.get('email') as string;
    let registrationId = formData.get('registration_id') as string | undefined;

    if (!name || !email) {
      return NextResponse.json({ status: 'error', message: 'Name and email are required' }, { status: 400 });
    }

    // Process files and check size limit (1MB)
    const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
    const answers: Record<string, any> = {};

    for (const [key, value] of formData.entries()) {
      if (key === 'name' || key === 'email' || key === 'registration_id') continue;
      
      if (value instanceof Blob) {
        if (value.size > MAX_FILE_SIZE) {
          return NextResponse.json({ status: 'error', message: `File size exceeds 1MB limit for field ${key}` }, { status: 413 });
        }
        answers[key] = { fileName: value.name, size: value.size, type: value.type }; 
      } else {
        answers[key] = value;
      }
    }

    const result = await processRegistrationAction(slug, {
      name,
      email,
      answers,
      registrationId,
    });

    return NextResponse.json({ status: 'success', data: result }, { status: 201 });
  } catch (error: any) {
    if (error.message.includes('QuotaExceededException')) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 400 });
    }
    if (error.message.includes('NotFoundException')) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 404 });
    }
    
    console.error('Registration Error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
