'use client';

import { createContext, useContext } from 'react';

const EventContext = createContext<string>('');

export function EventProvider({ children, eventName }: { children: React.ReactNode; eventName: string }) {
  return <EventContext.Provider value={eventName}>{children}</EventContext.Provider>;
}

export function useEventName() {
  return useContext(EventContext);
}
