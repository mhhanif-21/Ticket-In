import 'package:event_gate_admin/screens/detail_event_metrics_screen.dart';
import 'package:event_gate_admin/services/admin_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeStatsService extends AdminService {
  @override
  Future<Map<String, dynamic>> getEventStats(String eventId) async => {
        'name': 'Contract Event',
        'date': '2026-08-20T08:00:00.000Z',
        'total_capacity': 120,
        'pending': 5,
        'accepted': 30,
        'present': 10,
      };
}

void main() {
  testWidgets('event metrics displays API total_capacity fixture', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [adminServiceProvider.overrideWithValue(FakeStatsService())],
        child: const MaterialApp(home: DetailEventMetricsScreen(eventId: 'event-1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Dari 120 Kapasitas'), findsOneWidget);
    expect(find.text('Total Pendaftar'), findsOneWidget);
  });
}
