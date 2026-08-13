import 'package:flutter_test/flutter_test.dart';
import 'package:event_gate_admin/models/event_model.dart';

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

    test('fromJson should preserve public registration and QR URLs', () {
      final event = EventModel.fromJson({
        'id': 'evt_123',
        'name': 'Minimal Event',
        'slug': 'minimal-event',
        'capacity': 10,
        'location': 'Jakarta',
        'date': '2026-10-10T09:00:00Z',
        'registration_mode': 'Auto-Accept',
        'public_registration_url': 'https://event.test/minimal-event/register',
        'public_qr_code_url': 'https://event.test/api/v1/events/minimal-event/qr',
      });

      expect(event.publicRegistrationUrl, 'https://event.test/minimal-event/register');
      expect(event.publicQrCodeUrl, 'https://event.test/api/v1/events/minimal-event/qr');
    });

    test('form field should serialize the canonical snake_case payload', () {
      final field = FormFieldModel(
        fieldName: 'Nama',
        fieldType: 'text',
        isRequired: true,
        order: 0,
      );

      expect(field.toJson(), {
        'field_name': 'Nama',
        'field_type': 'text',
        'is_required': true,
        'options': null,
        'order': 0,
      });
    });
  });
}
