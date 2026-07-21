import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'screens/home_screen.dart';
import 'theme/app_theme.dart';
import 'screens/login_screen.dart';
import 'screens/create_event_screen.dart';
import 'screens/edit_event_screen.dart';
import 'screens/form_builder_screen.dart';
import 'screens/access_management_screen.dart';

void main() {
  runApp(
    const ProviderScope(
      child: EventGateAdminApp(),
    ),
  );
}

final _router = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/home',
      builder: (context, state) => const HomeScreen(),
    ),
    GoRoute(
      path: '/create-event',
      builder: (context, state) => const CreateEventScreen(),
    ),
    GoRoute(
      path: '/edit-event/:id',
      builder: (context, state) => EditEventScreen(eventId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/form-builder/:id',
      builder: (context, state) => FormBuilderScreen(eventId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/access-management/:id',
      builder: (context, state) => AccessManagementScreen(eventId: state.pathParameters['id']!),
    ),
  ],
);

class EventGateAdminApp extends ConsumerWidget {
  const EventGateAdminApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Event Gate Admin',
      theme: AppTheme.lightTheme,
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}
