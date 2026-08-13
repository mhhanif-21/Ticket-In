import { getPublicEventAction } from '@/lib/actions/getPublicEventAction';
import { EventProvider } from './event-context';
import ThemeToggle from './ThemeToggle';
import HeaderNavigation from './HeaderNavigation';
import Link from 'next/link';

export default async function SlugLayout(props: { children: React.ReactNode, params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const event = await getPublicEventAction(params.slug);

  const eventName = event ? event.name : 'Event Gate';

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen flex flex-col antialiased">
      <EventProvider eventName={eventName}>
        <header className="w-full sticky top-0 z-50 bg-surface dark:bg-background border-b border-outline-variant dark:border-on-surface-variant shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
          <div className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop flex items-center justify-between h-[72px]">
            <HeaderNavigation slug={params.slug} />
            <h1 className="font-display-lg text-headline-md md:text-display-lg text-primary dark:text-white tracking-tight truncate flex-1 text-center px-4">
              {eventName}
            </h1>
            <ThemeToggle />
          </div>
        </header>

        <div className="flex-grow w-full flex flex-col">
          {props.children}
        </div>

        <footer className="w-full bg-background border-t border-outline-variant py-8 px-margin-mobile md:px-margin-desktop mt-auto">
          <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-center gap-stack-md">
            <div className="text-on-surface-variant font-description text-description">
              &copy; {new Date().getFullYear()} TiketIn. All rights reserved.
            </div>
            <div className="flex gap-stack-md">
              <Link href="#" className="font-description text-description text-on-surface-variant hover:text-primary transition-colors duration-150">Privacy Policy</Link>
              <Link href="#" className="font-description text-description text-on-surface-variant hover:text-primary transition-colors duration-150">Terms of Service</Link>
              <Link href="#" className="font-description text-description text-on-surface-variant hover:text-primary transition-colors duration-150">Support</Link>
            </div>
          </div>
        </footer>
      </EventProvider>
    </div>
  );
}
