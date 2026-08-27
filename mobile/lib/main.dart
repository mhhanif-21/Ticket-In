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
import 'screens/detail_event_metrics_screen.dart';
import 'screens/executive_oversight_screen.dart';
import 'screens/admin_dashboard_screen.dart';
import 'screens/participants_screen.dart';
import 'screens/review_detail_screen.dart';
import 'screens/ticket_template_screen.dart';
import 'providers/admin_providers.dart';
import 'services/auth_session.dart';

void main() {
  runApp(const ProviderScope(child: EventGateAdminApp()));
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  Widget build(BuildContext context) {
    // Layar putih bersih dengan loading indicator saat cek token
    return const Scaffold(
      backgroundColor: Color(0xFFF9F9F9),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_available, size: 48, color: Color(0xFF000000)),
            SizedBox(height: 16),
            Text(
              'Event Gate',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w600,
                color: Color(0xFF000000),
                letterSpacing: -0.02,
              ),
            ),
            SizedBox(height: 32),
            CircularProgressIndicator(color: Color(0xFF000000), strokeWidth: 2),
          ],
        ),
      ),
    );
  }
}

String? resolveAppRoute(AuthSessionStatus authStatus, String location) {
  if (authStatus == AuthSessionStatus.initializing) {
    return location == '/splash' ? null : '/splash';
  }
  if (authStatus == AuthSessionStatus.unauthenticated) {
    return location == '/login' ? null : '/login';
  }
  if (location == '/splash' || location == '/login') {
    return '/admin-dashboard';
  }
  return null;
}

Map<String, dynamic>? reviewParticipantDataFromExtra(Object? extra) {
  if (extra is! Map) return null;
  final data = <String, dynamic>{};
  for (final entry in extra.entries) {
    if (entry.key is String) data[entry.key as String] = entry.value;
  }
  final id = data['id'];
  return id is String && id.trim().isNotEmpty ? data : null;
}

GoRouter buildAppRouter(AuthSessionController authSession) => GoRouter(
  initialLocation: '/splash',
  refreshListenable: authSession,
  redirect: (context, state) =>
      resolveAppRoute(authSession.status, state.matchedLocation),
  routes: [
    GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
    GoRoute(
      path: '/create-event',
      builder: (context, state) => const CreateEventScreen(),
    ),
    GoRoute(
      path: '/edit-event/:id',
      builder: (context, state) =>
          EditEventScreen(eventId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/form-builder/:id',
      // [BUG-054] FIX: isFirstSetup=true jika datang dari create-event
      // create_event_screen mengirim pushReplacement ke route ini tanpa extra → isFirstSetup=true by default
      builder: (context, state) => FormBuilderScreen(
        eventId: state.pathParameters['id']!,
        isFirstSetup: state.extra == 'first_setup',
      ),
    ),
    GoRoute(
      path: '/access-management/:id',
      builder: (context, state) =>
          AccessManagementScreen(eventId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/ticket-template/:id',
      builder: (context, state) => TicketTemplateScreen(
        eventId: state.pathParameters['id']!,
        isFirstSetup: state.extra == 'first_setup',
      ),
    ),
    // [BUG-048] FIX: Route baru untuk halaman detail event menggantikan Bottom Sheet
    GoRoute(
      path: '/event-detail/:id',
      builder: (context, state) =>
          DetailEventMetricsScreen(eventId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/detail-metrics/:id',
      builder: (context, state) {
        return DetailEventMetricsScreen(eventId: state.pathParameters['id']!);
      },
    ),
    GoRoute(
      path: '/executive-oversight',
      builder: (context, state) => const ExecutiveOversightScreen(),
    ),
    GoRoute(
      path: '/admin-dashboard',
      builder: (context, state) => const AdminDashboardScreen(),
    ),
    GoRoute(
      path: '/participants/:id',
      builder: (context, state) =>
          ParticipantsScreen(eventId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/review-detail',
      builder: (context, state) {
        final participantData = reviewParticipantDataFromExtra(state.extra);
        if (participantData == null) return const _InvalidReviewDetailScreen();
        return ReviewDetailScreen(participantData: participantData);
      },
    ),
  ],
);

class _InvalidReviewDetailScreen extends StatelessWidget {
  const _InvalidReviewDetailScreen();

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Detail Pendaftar')),
    body: Center(
      child: ElevatedButton(
        onPressed: () => context.go('/admin-dashboard'),
        child: const Text('Data pendaftar tidak tersedia'),
      ),
    ),
  );
}

class EventGateAdminApp extends ConsumerStatefulWidget {
  const EventGateAdminApp({super.key});

  @override
  ConsumerState<EventGateAdminApp> createState() => _EventGateAdminAppState();
}

class _EventGateAdminAppState extends ConsumerState<EventGateAdminApp> {
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _router = buildAppRouter(ref.read(authSessionProvider));
  }

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Register the provider dependency for testability and lifecycle ownership;
    // GoRouter itself receives updates through refreshListenable.
    ref.watch(authSessionProvider);
    return MaterialApp.router(
      title: 'Ticket-In',
      theme: AppTheme.lightTheme,
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}
