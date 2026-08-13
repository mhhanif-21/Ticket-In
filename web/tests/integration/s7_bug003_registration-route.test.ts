import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  upload: vi.fn(),
  processRegistration: vi.fn(),
  publishTicketJob: vi.fn(),
}));

vi.mock('@/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { storage: { from: vi.fn(() => ({ upload: mocks.upload })) } },
}));
vi.mock('@/lib/actions/processRegistrationAction', () => ({
  processRegistrationAction: mocks.processRegistration,
}));
vi.mock('@/lib/actions/ticketGenerationJob', () => ({
  publishTicketGenerationJob: mocks.publishTicketJob,
}));

import { POST } from '../../app/api/v1/events/[id]/register/route';

const eventFixture = { id: '00000000-0000-4000-8000-000000000003' };

function prepareDatabase(fields: Array<Record<string, unknown>>) {
  const eventQuery = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  eventQuery.from.mockReturnValue(eventQuery);
  eventQuery.where.mockReturnValue(eventQuery);
  eventQuery.limit.mockResolvedValue([eventFixture]);

  const fieldsQuery = { from: vi.fn(), where: vi.fn() };
  fieldsQuery.from.mockReturnValue(fieldsQuery);
  fieldsQuery.where.mockResolvedValue(fields);

  mocks.select.mockReturnValueOnce(eventQuery).mockReturnValueOnce(fieldsQuery);
}

function requestWith(fields: Record<string, string | Blob>): NextRequest {
  const form = new FormData();
  form.set('name', 'Route Test User');
  form.set('email', 'route-test@example.test');
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest('http://localhost/api/v1/events/test-event/register', {
    method: 'POST',
    body: form,
  });
}

describe('BUG-003 registration multipart route validation', () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.upload.mockReset();
    mocks.processRegistration.mockReset();
    mocks.publishTicketJob.mockReset();
    mocks.processRegistration.mockResolvedValue({ status: 'Pending', registrationId: eventFixture.id });
  });

  it('returns 422 for a missing required answer before any storage write', async () => {
    prepareDatabase([{ id: 'required', fieldName: 'Company', fieldType: 'text', isRequired: true, options: null }]);

    const response = await POST(requestWith({}), { params: Promise.resolve({ id: 'test-event' }) });

    expect(response.status).toBe(422);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.processRegistration).not.toHaveBeenCalled();
  });

  it('returns 422 for an invalid choice option or unknown field before storage', async () => {
    prepareDatabase([{ id: 'choice', fieldName: 'Attendance', fieldType: 'select', isRequired: true, options: ['Morning'] }]);

    const invalidOption = await POST(
      requestWith({ field_choice: 'Evening' }),
      { params: Promise.resolve({ id: 'test-event' }) },
    );
    expect(invalidOption.status).toBe(422);
    expect(mocks.upload).not.toHaveBeenCalled();

    mocks.select.mockReset();
    prepareDatabase([{ id: 'choice', fieldName: 'Attendance', fieldType: 'select', isRequired: false, options: ['Morning'] }]);
    const unknownField = await POST(
      requestWith({ field_untrusted: 'injected' }),
      { params: Promise.resolve({ id: 'test-event' }) },
    );
    expect(unknownField.status).toBe(422);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('processes a valid PNG multipart answer and only then calls storage', async () => {
    prepareDatabase([{ id: 'proof', fieldName: 'Proof', fieldType: 'file', isRequired: true, options: null }]);
    mocks.upload.mockResolvedValue({ error: null });

    const file = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });
    const response = await POST(
      requestWith({ field_proof: file }),
      { params: Promise.resolve({ id: 'test-event' }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.processRegistration).toHaveBeenCalledTimes(1);
  });
});
