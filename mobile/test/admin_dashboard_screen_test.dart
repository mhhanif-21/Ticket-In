import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:event_gate_admin/screens/admin_dashboard_screen.dart';
import 'package:event_gate_admin/services/admin_service.dart';

class FakeDashboardService extends AdminService {
  final bool fail;

  FakeDashboardService({this.fail = false}) : super();

  @override
  Future<Map<String, dynamic>> getDashboardStats() async {
    if (fail) throw Exception('dashboard unavailable');
    return {
      'total_events': 2,
      'total_registrations': 12,
      'total_present': 7,
      'recent_events': [
        {'name': 'Demo Event', 'date': '2026-08-20T08:00:00.000Z', 'location': 'Jakarta', 'registrants_count': 4},
      ],
    };
  }
}

Widget buildDashboard(FakeDashboardService service) {
  return ProviderScope(
    overrides: [adminServiceProvider.overrideWithValue(service)],
    child: const MaterialApp(home: AdminDashboardScreen()),
  );
}

void main() {
  testWidgets('dashboard renders production statistics and recent event', (tester) async {
    await tester.pumpWidget(buildDashboard(FakeDashboardService()));
    await tester.pumpAndSettle();

    expect(find.text('Halo, Admin'), findsOneWidget);
    expect(find.text('5 Event Terakhir'), findsOneWidget);
    expect(find.text('12'), findsOneWidget);
    expect(find.text('7'), findsOneWidget);
    expect(find.text('Demo Event'), findsOneWidget);
  });

  testWidgets('dashboard renders service error state', (tester) async {
    await tester.pumpWidget(buildDashboard(FakeDashboardService(fail: true)));
    await tester.pumpAndSettle();

    expect(find.textContaining('Error:'), findsOneWidget);
  });
}
