import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as jose from 'jose';

export default async function ScannerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('volunteer_token')?.value;

  if (!token) {
    redirect(`/${resolvedParams.slug}/checkin`);
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key');
    const { payload } = await jose.jwtVerify(token, secret);

    if (payload.role !== 'volunteer' || payload.event_slug !== resolvedParams.slug) {
      redirect(`/${resolvedParams.slug}/checkin`);
    }
  } catch (error) {
    redirect(`/${resolvedParams.slug}/checkin`);
  }

  return <>{children}</>;
}
