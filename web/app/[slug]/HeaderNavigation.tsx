'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function HeaderNavigation({ slug }: { slug: string }) {
  const pathname = usePathname();
  const isScannerPage = pathname.endsWith('/scan') || pathname.endsWith('/scan/');
  const backHref = isScannerPage ? `/${slug}/checkin` : `/${slug}`;

  return (
    <Link
      href={backHref}
      className="hover:opacity-80 transition-opacity duration-150 active:scale-[0.96] transition-transform p-2 -ml-2 text-primary dark:text-white flex items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <span className="material-symbols-outlined text-2xl">arrow_back</span>
      <span className="sr-only">Back</span>
    </Link>
  );
}
