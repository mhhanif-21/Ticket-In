import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/event_model.dart';

void main() {
  group('EventModel Tests', () {
    test('fromJson should parse valid JSON correctly', () {
      final json = {
        'id': 'evt_123',
        'name': 'Test Event',
        'slug': 'test-event',
        'capacity': 100,
        'location': 'Jakarta',
        'date': '2026-10-10T09:00:00Z',
        'status': 'Draft',
        'registration_mode': 'Auto-Accept',
      };

      final event = EventModel.fromJson(json);

      expect(event.id, 'evt_123');
      expect(event.name, 'Test Event');
      expect(event.slug, 'test-event');
      expect(event.capacity, 100);
      expect(event.location, 'Jakarta');
      expect(event.date, DateTime.parse('2026-10-10T09:00:00Z'));
      expect(event.status, 'Draft');
      expect(event.registrationMode, 'Auto-Accept');
      expect(event.publicRegistrationUrl, isNull);
    });

    test('toJson should serialize to valid JSON map', () {
      final event = EventModel(
        id: 'evt_123',
        name: 'Test Event',
        slug: 'test-event',
        capacity: 100,
        location: 'Jakarta',
        date: DateTime.parse('2026-10-10T09:00:00Z'),
        status: 'Draft',
        registrationMode: 'Auto-Accept',
      );

      final json = event.toJson();

      expect(json['id'], 'evt_123');
      expect(json['name'], 'Test Event');
      expect(json['slug'], 'test-event');
      expect(json['capacity'], 100);
      expect(json['location'], 'Jakarta');
      expect(json['date'], '2026-10-10T09:00:00.000Z');
      expect(json['status'], 'Draft');
      expect(json['registration_mode'], 'Auto-Accept');
    });
  });
}
