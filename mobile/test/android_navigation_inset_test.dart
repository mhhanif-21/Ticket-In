import 'package:event_gate_admin/screens/create_event_screen.dart';
import 'package:event_gate_admin/screens/edit_event_screen.dart';
import 'package:event_gate_admin/screens/form_builder_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'edit_event_screen_test.dart' show FakeEventService;
import 'form_builder_screen_test.dart' show FakeFormBuilderEventService;

void main() {
  testWidgets('create event harus menghormati bottom inset Android', (tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(
          padding: EdgeInsets.zero,
          viewPadding: EdgeInsets.only(bottom: 48),
        ),
        child: const MaterialApp(home: CreateEventScreen()),
      ),
    );
    await tester.pump();

    final action = find.byKey(const ValueKey('create-event-bottom-action'));
    expect(action, findsOneWidget);
    final safeArea = find.ancestor(of: action, matching: find.byType(SafeArea));
    expect(safeArea, findsOneWidget);
    expect(tester.widget<SafeArea>(safeArea).maintainBottomViewPadding, isTrue);
  });

  testWidgets('edit event harus menghormati bottom inset Android', (tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(
          padding: EdgeInsets.zero,
          viewPadding: EdgeInsets.only(bottom: 48),
        ),
        child: MaterialApp(
          home: EditEventScreen(eventId: 'event-1', eventService: FakeEventService()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final action = find.byKey(const ValueKey('edit-event-bottom-action'));
    expect(action, findsOneWidget);
    final safeArea = find.ancestor(of: action, matching: find.byType(SafeArea));
    expect(safeArea, findsOneWidget);
    expect(tester.widget<SafeArea>(safeArea).maintainBottomViewPadding, isTrue);
  });

  testWidgets('susun form harus memakai bottom action dengan view padding Android', (tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(
          padding: EdgeInsets.only(bottom: 48),
          viewPadding: EdgeInsets.only(bottom: 48),
        ),
        child: MaterialApp(
          home: FormBuilderScreen(
            eventId: 'event-1',
            eventService: FakeFormBuilderEventService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final action = find.byKey(const ValueKey('form-builder-bottom-action'));
    expect(action, findsOneWidget);
    expect(find.ancestor(of: action, matching: find.byType(AppBar)), findsNothing);
    final safeArea = find.ancestor(of: action, matching: find.byType(SafeArea));
    expect(safeArea, findsOneWidget);
    expect(tester.widget<SafeArea>(safeArea).maintainBottomViewPadding, isTrue);
  });
}
