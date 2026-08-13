import { describe, expect, it } from 'vitest';
import { STORAGE_BUCKETS } from '@/lib/storage/buckets';

describe('Storage bucket contract', () => {
  it('uses the canonical bucket names shared by runtime and migration', () => {
    expect(STORAGE_BUCKETS).toEqual({
      eventPosters: 'event_posters',
      participantFiles: 'participant_files',
      tickets: 'tickets',
    });
  });
});
