import 'package:event_gate_admin/screens/participants_screen.dart';
import 'package:event_gate_admin/services/admin_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeExportService extends AdminService {
  final List<Map<String, dynamic>> statuses;
  int statusIndex = 0;

  FakeExportService(this.statuses);

  @override
  Future<Map<String, dynamic>> getParticipants(String eventId, {String? status, String? attendance, String? sort, String? search, int page = 1, int limit = 15}) async => {
        'data': <dynamic>[],
        'meta': {'totalPages': 1},
      };

  @override
  Future<String> triggerExportCSV(String eventId) async => 'job-1';

  @override
  Future<Map<String, dynamic>> getExportStatus(String jobId) async {
    final status = statuses[statusIndex < statuses.length ? statusIndex : statuses.length - 1];
    statusIndex++;
    return status;
  }
}

Future<void> pumpExportScreen(WidgetTester tester, FakeExportService service, {List<String>? opened}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [adminServiceProvider.overrideWithValue(service)],
      child: MaterialApp(
        home: ParticipantsScreen(
          eventId: 'event-1',
          exportPollInterval: Duration.zero,
          exportMaxAttempts: 1,
          exportUrlOpener: (url) async {
            opened?.add(url);
            return true;
          },
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('pending export times out without opening a URL', (tester) async {
    final opened = <String>[];
    await pumpExportScreen(tester, FakeExportService([{'status': 'pending'}]), opened: opened);
    await tester.tap(find.byIcon(Icons.download));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    expect(opened, isEmpty);
    expect(find.byKey(const ValueKey('export-feedback')), findsOneWidget);
    expect(find.textContaining('Waktu tunggu habis'), findsOneWidget);
  });

  testWidgets('completed export reads file_url and opens it', (tester) async {
    final opened = <String>[];
    await pumpExportScreen(tester, FakeExportService([{'status': 'completed', 'file_url': 'https://example.test/export.csv'}]), opened: opened);
    await tester.tap(find.byIcon(Icons.download));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    expect(opened, ['https://example.test/export.csv']);
  });

  testWidgets('failed export shows an error and does not open a URL', (tester) async {
    final opened = <String>[];
    await pumpExportScreen(tester, FakeExportService([{'status': 'failed', 'error': 'CSV generation failed'}]), opened: opened);
    await tester.tap(find.byIcon(Icons.download));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    expect(opened, isEmpty);
    expect(find.byKey(const ValueKey('export-feedback')), findsOneWidget);
    expect(find.textContaining('CSV generation failed'), findsOneWidget);
  });
}
