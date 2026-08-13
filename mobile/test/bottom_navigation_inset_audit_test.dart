import 'package:event_gate_admin/screens/admin_dashboard_screen.dart';
import 'package:event_gate_admin/screens/home_screen.dart';
import 'package:event_gate_admin/screens/review_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void expectBottomInsetHandling(WidgetTester tester, Key key) {
  final action = find.byKey(key);
  expect(action, findsOneWidget);
  final safeArea = find.ancestor(of: action, matching: find.byType(SafeArea));
  expect(safeArea, findsOneWidget);
  expect(tester.widget<SafeArea>(safeArea).maintainBottomViewPadding, isTrue);
}

void main() {
  const insetMediaQuery = MediaQueryData(
    padding: EdgeInsets.only(bottom: 48),
    viewPadding: EdgeInsets.only(bottom: 48),
  );

  testWidgets('home bottom navigation menghormati Android view padding', (tester) async {
    await tester.pumpWidget(
      const MediaQuery(
        data: insetMediaQuery,
        child: MaterialApp(home: HomeScreen()),
      ),
    );
    await tester.pump();

    expectBottomInsetHandling(tester, const ValueKey('home-bottom-navigation'));
  });

  testWidgets('dashboard bottom navigation menghormati Android view padding', (tester) async {
    await tester.pumpWidget(
      const MediaQuery(
        data: insetMediaQuery,
        child: ProviderScope(child: MaterialApp(home: AdminDashboardScreen())),
      ),
    );
    await tester.pump();

    expectBottomInsetHandling(tester, const ValueKey('admin-dashboard-bottom-navigation'));
  });

  testWidgets('review detail bottom action menghormati Android view padding', (tester) async {
    await tester.pumpWidget(
      const MediaQuery(
        data: insetMediaQuery,
        child: MaterialApp(
          home: ReviewDetailScreen(
            participantData: {
              'id': 'participant-1',
              'name': 'Participant',
              'email': 'participant@example.test',
              'status': 'Pending',
            },
          ),
        ),
      ),
    );
    await tester.pump();

    expectBottomInsetHandling(tester, const ValueKey('review-detail-bottom-action'));
  });
}
