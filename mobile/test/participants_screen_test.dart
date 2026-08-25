import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:event_gate_admin/screens/participants_screen.dart';
import 'package:event_gate_admin/services/admin_service.dart';

class FakeParticipantsService extends AdminService {
  final bool fail;

  FakeParticipantsService({this.fail = false}) : super();

  @override
  Future<Map<String, dynamic>> getParticipants(
    String eventId, {
    String? status,
    String? attendance,
    String? sort,
    String? search,
    DateTime? startDate,
    DateTime? endDate,
    int page = 1,
    int limit = 15,
  }) async {
    if (fail) throw Exception('participants unavailable');
    return {
      'data': [
        {'id': 'registration-1', 'name': 'Siti Tester', 'email': 'siti@example.test', 'status': 'Accepted', 'company': 'QA Team'},
      ],
      'meta': {'totalPages': 1},
    };
  }
}

Widget buildParticipants(FakeParticipantsService service) {
  return ProviderScope(
    overrides: [adminServiceProvider.overrideWithValue(service)],
    child: const MaterialApp(home: ParticipantsScreen(eventId: 'event-1')),
  );
}

void main() {
  testWidgets('participants screen renders production list and controls', (tester) async {
    await tester.pumpWidget(buildParticipants(FakeParticipantsService()));
    await tester.pumpAndSettle();

    expect(find.text('Daftar Peserta'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byIcon(Icons.tune), findsOneWidget);
    expect(find.text('Siti Tester'), findsOneWidget);
    expect(find.text('Accepted'), findsOneWidget);
  });

  testWidgets('participants screen exposes service failure feedback', (tester) async {
    await tester.pumpWidget(buildParticipants(FakeParticipantsService(fail: true)));
    await tester.pumpAndSettle();

    expect(find.text('Tidak ada pendaftar ditemukan.'), findsOneWidget);
  });
}
