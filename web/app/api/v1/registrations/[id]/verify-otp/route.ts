import { NextRequest, NextResponse } from 'next/server';
import { verifyOtpAction } from '@/lib/actions/processRegistrationAction';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: registrationId } = await params;
    const body = await req.json();
    const otpCode = body.otp_code;

    if (!otpCode) {
      return NextResponse.json({ status: 'error', message: 'OTP Code required' }, { status: 400 });
    }

    const result = await verifyOtpAction(registrationId, otpCode);

    return NextResponse.json({ status: 'success', message: 'OTP valid. Pendaftaran diproses.', data: result }, { status: 200 });
  } catch (error: any) {
    if (error.message.includes('InvalidOTP')) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 400 });
    }

    console.error('OTP Verification Error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}
