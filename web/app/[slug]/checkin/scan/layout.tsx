import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyVolunteerToken } from '@/lib/security/jwt';

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

  let payload;
  try {
    payload = await verifyVolunteerToken(token);
  } catch {
    redirect(`/${resolvedParams.slug}/checkin`);
  }

  if (payload.role !== 'volunteer' || payload.event_slug !== resolvedParams.slug) {
    redirect(`/${resolvedParams.slug}/checkin`);
  }

  return <>{children}</>;
}
