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

  Future<void> pumpMetrics(
    WidgetTester tester, {
    required String name,
    required int accepted,
    required int present,
    required int pending,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          adminServiceProvider.overrideWithValue(
            FakeStatsServiceWithData(
              name: name,
              accepted: accepted,
              present: present,
              pending: pending,
            ),
          ),
        ],
        child: const MaterialApp(home: DetailEventMetricsScreen(eventId: 'event-1')),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  }

  testWidgets('event metrics tidak overflow pada data 0 persen', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    await pumpMetrics(tester, name: 'Event 0 Persen', accepted: 0, present: 0, pending: 0);
    await tester.binding.setSurfaceSize(null);
  });

  testWidgets('event metrics tidak overflow pada data normal dan label event panjang', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    await pumpMetrics(
      tester,
      name: 'Konferensi Nasional Penyelenggara Acara dan Teknologi Pendaftaran Peserta 2026',
      accepted: 30,
      present: 10,
      pending: 5,
    );
    await tester.binding.setSurfaceSize(null);
  });
}

class FakeStatsServiceWithData extends AdminService {
  final String name;
  final int accepted;
  final int present;
  final int pending;

  FakeStatsServiceWithData({
    required this.name,
    required this.accepted,
    required this.present,
    required this.pending,
  });

  @override
  Future<Map<String, dynamic>> getEventStats(String eventId) async => {
        'name': name,
        'date': '2026-08-20T08:00:00.000Z',
        'total_capacity': 120,
        'pending': pending,
        'accepted': accepted,
        'present': present,
      };
}
