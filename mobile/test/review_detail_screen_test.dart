import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:event_gate_admin/screens/review_detail_screen.dart';
import 'package:event_gate_admin/services/admin_service.dart';

class FakeReviewService extends AdminService {
  String? action;

  FakeReviewService() : super();

  @override
  Future<void> reviewParticipant(String registrationId, String requestedAction) async {
    action = requestedAction;
  }
}

void main() {
  testWidgets('review detail renders participant info and actions', (tester) async {
    final service = FakeReviewService();
    await tester.pumpWidget(
      MaterialApp(
        home: ReviewDetailScreen(
          adminService: service,
          participantData: {
            'id': 'registration-1',
            'name': 'Budi Tester',
            'email': 'budi@example.test',
            'status': 'Pending',
            'createdAt': '2026-08-20T08:00:00.000Z',
            'answers': {'field1': 18, 'field2': ''},
            'answerFieldLabels': {'field1': 'Umur', 'field2': 'Instansi'},
          },
        ),
      ),
    );

    expect(find.text('Review Pendaftar'), findsOneWidget);
    expect(find.text('Budi Tester'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Waktu Daftar'), findsOneWidget);
    expect(find.text('Umur'), findsOneWidget);
    expect(find.text('18'), findsOneWidget);
    expect(find.text('field1'), findsNothing);
    expect(find.text('Setujui'), findsOneWidget);
    expect(find.text('Tolak'), findsOneWidget);

    await tester.tap(find.text('Setujui'));
    await tester.pumpAndSettle();
    expect(service.action, 'Approve');
  });

  testWidgets('review detail does not show review actions for final status', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: ReviewDetailScreen(
          participantData: {
            'id': 'registration-2',
            'name': 'Accepted User',
            'email': 'accepted@example.test',
            'status': 'Accepted',
            'answers': <String, dynamic>{},
          },
        ),
      ),
    );

    expect(find.text('Setujui'), findsNothing);
    expect(find.text('Tolak'), findsNothing);
    expect(find.text('Status Accepted sudah final.'), findsOneWidget);
  });
}
