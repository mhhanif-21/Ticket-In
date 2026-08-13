import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: databaseMocks.select,
  },
}));

import { GET } from '../../app/api/v1/events/[id]/route';

const eventFixture = {
  id: '0e2a6a86-1932-41fd-827d-9d29c7352e01',
  name: 'Public Projection Event',
  slug: 'public-projection-event',
  description: 'Event fixture for public DTO regression coverage.',
  location: 'Jakarta',
  date: new Date('2026-12-12T09:00:00.000Z'),
  posterUrl: 'https://example.test/poster.png',
  capacity: 25,
  registrationMode: 'Manual Review',
};

const formFieldFixture = {
  id: 'ad1487cf-e54c-4a6b-8eb5-c8c74b14be96',
  fieldName: 'Organisation',
  fieldType: 'text',
  isRequired: true,
  options: null,
  order: 1,
};

function preparePublicEventQuery() {
  const eventQuery = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  eventQuery.from.mockReturnValue(eventQuery);
  eventQuery.where.mockReturnValue(eventQuery);
  eventQuery.limit.mockResolvedValue([eventFixture]);

  const formFieldsQuery = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };
  formFieldsQuery.from.mockReturnValue(formFieldsQuery);
  formFieldsQuery.where.mockReturnValue(formFieldsQuery);
  formFieldsQuery.orderBy.mockResolvedValue([formFieldFixture]);

  databaseMocks.select
    .mockReturnValueOnce(eventQuery)
    .mockReturnValueOnce(formFieldsQuery);
}

describe('BUG-001 public event detail projection', () => {
  beforeEach(() => {
    databaseMocks.select.mockReset();
    preparePublicEventQuery();
  });

  it('does not expose volunteer PIN hashes or internal persistence fields to the public route', async () => {
    const response = await GET(new Request('http://localhost/api/v1/events/public-projection-event'), {
      params: Promise.resolve({ id: eventFixture.slug }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({
      status: 'success',
      data: {
        name: eventFixture.name,
        slug: eventFixture.slug,
        description: eventFixture.description,
        location: eventFixture.location,
        capacity: eventFixture.capacity,
        posterUrl: eventFixture.posterUrl,
        formFields: [formFieldFixture],
      },
    });
    expect(body.data).not.toHaveProperty('volunteerPinHash');
    expect(body.data).not.toHaveProperty('createdAt');
    expect(body.data).not.toHaveProperty('updatedAt');
    expect(body.data.formFields[0]).not.toHaveProperty('eventId');
    expect(databaseMocks.select.mock.calls[0][0]).not.toHaveProperty('volunteerPinHash');
  });

  it('keeps the same safe event boundary for a request addressed by event UUID', async () => {
    const response = await GET(
      new Request(`http://localhost/api/v1/events/${eventFixture.id}`, {
        headers: { Authorization: 'Bearer test-admin-boundary-token' },
      }),
      { params: Promise.resolve({ id: eventFixture.id }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data).toMatchObject({
      name: eventFixture.name,
      slug: eventFixture.slug,
      location: eventFixture.location,
      capacity: eventFixture.capacity,
      posterUrl: eventFixture.posterUrl,
    });
    expect(body.data).not.toHaveProperty('volunteerPinHash');
    expect(body.data.formFields[0]).not.toHaveProperty('eventId');
  });
});
