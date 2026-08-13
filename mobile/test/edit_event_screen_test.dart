import 'package:event_gate_admin/models/event_model.dart';
import 'package:event_gate_admin/services/event_service.dart';
import 'package:event_gate_admin/screens/edit_event_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeEventService extends EventService {
  Map<String, dynamic>? updatedData;
  String? uploadedPosterPath;
  String? currentPosterUrl;

  FakeEventService() : super();

  @override
  Future<EventModel> getEventDetail(String id) async => EventModel(
        id: id,
        name: 'Existing Event',
        slug: 'existing-event',
        capacity: 50,
        location: 'Jakarta',
        description: 'Existing description',
        date: DateTime.now().add(const Duration(days: 2)),
        status: 'Draft',
        registrationMode: 'Auto-Accept',
        posterUrl: currentPosterUrl,
      );

  @override
  Future<void> updateEvent(String id, Map<String, dynamic> data) async {
    updatedData = data;
  }

  @override
  Future<void> uploadEventPoster(String id, String posterPath) async {
    uploadedPosterPath = posterPath;
    currentPosterUrl = 'https://cdn.example.test/$id/replacement.png';
  }
}

void main() {
  testWidgets('edit event loads and persists description and exposes poster picker', (tester) async {
    final service = FakeEventService();
    await tester.pumpWidget(MaterialApp(home: EditEventScreen(eventId: 'event-1', eventService: service)));
    await tester.pumpAndSettle();

    expect(find.text('Existing Event'), findsOneWidget);
    expect(find.byKey(const ValueKey('edit-poster-picker')), findsOneWidget);

    final textFields = find.byType(TextFormField);
    expect(tester.widget<TextFormField>(textFields.last).controller?.text, 'Existing description');
    await tester.enterText(textFields.last, 'Updated description');
    await tester.tap(find.text('Simpan Perubahan'));
    await tester.pumpAndSettle();

    expect(service.updatedData?['description'], 'Updated description');
    expect(service.updatedData?['capacity'], 50);
  });

}
