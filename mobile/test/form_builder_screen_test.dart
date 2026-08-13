import 'package:event_gate_admin/models/event_model.dart';
import 'package:event_gate_admin/screens/form_builder_screen.dart';
import 'package:event_gate_admin/services/event_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeFormBuilderEventService extends EventService {
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
  Future<void> saveFormFields(String id, List<FormFieldModel> fields) async {}
}

void main() {
  testWidgets('Simpan harus berupa primary button dengan tap target minimal 48 px', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: FormBuilderScreen(
          eventId: 'event-1',
          eventService: FakeFormBuilderEventService(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final button = find.widgetWithText(ElevatedButton, 'Simpan');
    expect(button, findsOneWidget);
    expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
  });
}
