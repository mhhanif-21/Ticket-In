import 'dart:convert';
import 'dart:io';

import 'package:event_gate_admin/services/api_client.dart';
import 'package:event_gate_admin/services/event_service.dart';
import 'package:event_gate_admin/models/event_model.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

class RecordingApiClient extends ApiClient {
  Map<String, dynamic>? capturedBody;

  RecordingApiClient() : super(baseUrl: 'https://api.example.test/api');

  @override
  Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    capturedBody = body;
    return http.Response(jsonEncode({'status': 'success', 'data': {'id': 'event-1'}}), 201);
  }
}

class RecordingMultipartApiClient extends ApiClient {
  String? uploadedPath;

  RecordingMultipartApiClient() : super(baseUrl: 'https://api.example.test/api');

  @override
  Future<http.StreamedResponse> multipartRequest(
    String endpoint,
    String method,
    Map<String, String> fields, {
    String? filePath,
    String? fileField,
  }) async {
    uploadedPath = filePath;
    return http.StreamedResponse(Stream<List<int>>.value(utf8.encode('{}')), 201);
  }
}

class RecordingFormApiClient extends ApiClient {
  String? endpoint;
  Map<String, dynamic>? capturedBody;

  RecordingFormApiClient() : super(baseUrl: 'https://api.example.test/api');

  @override
  Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    this.endpoint = endpoint;
    capturedBody = body;
    return http.Response('{"status":"success"}', 200);
  }
}

class ReloadableEventService extends EventService {
  String? posterUrl;

  ReloadableEventService() : super();

  @override
  Future<void> uploadEventPoster(String id, String posterPath) async {
    posterUrl = 'https://cdn.example.test/$id/replacement.png';
  }

  @override
  Future<EventModel> getEventDetail(String id) async => EventModel(
        id: id,
        name: 'Reloaded Event',
        slug: 'reloaded-event',
        capacity: 10,
        location: 'Jakarta',
        description: 'Reloaded',
        date: DateTime(2026, 8, 20),
        status: 'Draft',
        registrationMode: 'Auto-Accept',
        posterUrl: posterUrl,
      );
}

void main() {
  test('create event contract preserves capacity as JSON integer', () async {
    final apiClient = RecordingApiClient();
    final service = EventService(apiClient: apiClient);

    await service.createEvent({
      'name': 'Typed Event',
      'capacity': 120,
      'date': '2026-08-20T08:00:00.000Z',
    });

    expect(apiClient.capturedBody?['capacity'], 120);
    expect(apiClient.capturedBody?['capacity'], isA<int>());
  });

  test('save form fields sends the canonical field_type payload to the HTTP client', () async {
    final apiClient = RecordingFormApiClient();
    final service = EventService(apiClient: apiClient);

    await service.saveFormFields('event-1', [
      FormFieldModel(fieldName: 'Nama', fieldType: 'text', isRequired: true, order: 0),
      FormFieldModel(fieldName: 'Email', fieldType: 'email', isRequired: true, order: 1),
    ]);

    expect(apiClient.endpoint, '/v1/events/event-1/fields');
    final fields = apiClient.capturedBody?['fields'] as List;
    expect(fields.map((field) => field['field_type']), ['text', 'email']);
    expect(fields.every((field) => field.containsKey('field_type')), isTrue);
    expect(fields.any((field) => field.containsKey('fieldType')), isFalse);
  });

  test('poster replacement accepts JPEG and PNG, rejects invalid files, and uploads valid files', () async {
    final temp = await Directory.systemTemp.createTemp('event-gate-poster-service-');
    final jpeg = await File('${temp.path}/replacement.jpg').writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
    final png = await File('${temp.path}/replacement.png').writeAsBytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    final invalid = await File('${temp.path}/replacement.txt').writeAsBytes([0x25, 0x50, 0x44, 0x46]);
    final client = RecordingMultipartApiClient();
    final service = EventService(apiClient: client);

    await service.uploadEventPoster('event-1', jpeg.path);
    expect(client.uploadedPath, jpeg.path);
    await service.uploadEventPoster('event-1', png.path);
    expect(client.uploadedPath, png.path);
    await expectLater(service.uploadEventPoster('event-1', invalid.path), throwsArgumentError);
    expect(client.uploadedPath, png.path);

    await temp.delete(recursive: true);
  });

  test('poster replacement URL is available after detail reload', () async {
    final service = ReloadableEventService();

    await service.uploadEventPoster('event-1', '/tmp/replacement.png');

    expect((await service.getEventDetail('event-1')).posterUrl, 'https://cdn.example.test/event-1/replacement.png');
  });
}
