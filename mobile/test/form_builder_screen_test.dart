import 'dart:convert';

import 'package:event_gate_admin/models/event_model.dart';
import 'package:event_gate_admin/services/api_client.dart';
import 'package:event_gate_admin/screens/form_builder_screen.dart';
import 'package:event_gate_admin/services/event_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

class FormBuilderTraceApiClient extends ApiClient {
  Map<String, dynamic>? capturedBody;

  FormBuilderTraceApiClient() : super(baseUrl: 'https://api.example.test/api');

  @override
  Future<http.Response> get(String endpoint) async {
    return http.Response(jsonEncode({
      'status': 'success',
      'data': {
        'id': 'event-1',
        'name': 'Form Event',
        'slug': 'form-event',
        'capacity': 100,
        'location': 'Jakarta',
        'date': '2026-08-20T00:00:00.000Z',
        'status': 'Draft',
        'registration_mode': 'Auto-Accept',
        'form_fields': [],
      },
    }), 200);
  }

  @override
  Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    capturedBody = body;
    return http.Response('{"status":"success"}', 200);
  }
}

class FakeFormBuilderEventService extends EventService {
  List<FormFieldModel>? savedFields;

  FakeFormBuilderEventService() : super();

  @override
  Future<EventModel> getEventDetail(String id) async => EventModel(
        id: id,
        name: 'Form Event',
        slug: 'form-event',
        capacity: 100,
        location: 'Jakarta',
        date: DateTime(2026, 8, 20),
        status: 'Draft',
        registrationMode: 'Auto-Accept',
      );

  @override
  Future<void> saveFormFields(String id, List<FormFieldModel> fields) async {
    savedFields = fields;
  }
}

void main() {
  testWidgets('Simpan berada di bottom action dengan tap target minimal 48 px', (tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(padding: EdgeInsets.only(bottom: 48)),
        child: MaterialApp(
          home: FormBuilderScreen(
            eventId: 'event-1',
            eventService: FakeFormBuilderEventService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final button = find.widgetWithText(ElevatedButton, 'Simpan');
    expect(button, findsOneWidget);
    expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
    expect(find.ancestor(of: button, matching: find.byType(AppBar)), findsNothing);
    expect(find.ancestor(of: button, matching: find.byType(SafeArea)), findsOneWidget);
  });

  testWidgets('FormBuilder meneruskan field_type dari field runtime ke EventService', (tester) async {
    final service = FakeFormBuilderEventService();
    await tester.pumpWidget(
      MaterialApp(
        home: FormBuilderScreen(eventId: 'event-1', eventService: service),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Simpan'));
    await tester.pumpAndSettle();

    expect(service.savedFields, isNotNull);
    expect(service.savedFields!.map((field) => field.toJson()['field_type']), ['text', 'email']);
    expect(service.savedFields!.every((field) => field.toJson().containsKey('field_type')), isTrue);
  });

  testWidgets('FormBuilder menelusurkan field_type sampai ApiClient sebelum POST', (tester) async {
    final apiClient = FormBuilderTraceApiClient();
    await tester.pumpWidget(
      MaterialApp(
        home: FormBuilderScreen(
          eventId: 'event-1',
          eventService: EventService(apiClient: apiClient),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Simpan'));
    await tester.pumpAndSettle();

    final fields = apiClient.capturedBody?['fields'] as List;
    expect(fields.map((field) => field['field_type']), ['text', 'email']);
    expect(fields.every((field) => field.containsKey('field_type')), isTrue);
    expect(fields.any((field) => field['fieldType'] != null), isFalse);
  });
}
