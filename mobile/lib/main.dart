import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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
import 'services/api_client.dart';

void main() {
  runApp(const ProviderScope(child: EventGateAdminApp()));
}

// ─────────────────────────────────────────────────────────
// [BUG-053] FIX: Splash Screen dengan Session Persistence
// Cek session di SecureStorage saat app dibuka.
// Access token dapat diperbarui memakai refresh token tanpa login ulang.
// ─────────────────────────────────────────────────────────
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    const storage = FlutterSecureStorage();
    final accessToken = await storage.read(key: ApiClient.accessTokenKey);
    final refreshToken = await storage.read(key: ApiClient.refreshTokenKey);

    if (!mounted) return;

    if (accessToken != null &&
        accessToken.isNotEmpty &&
        refreshToken != null &&
        refreshToken.isNotEmpty) {
      // Session ditemukan → langsung ke Dashboard. ApiClient akan refresh jika perlu.
      context.go('/admin-dashboard');
    } else {
      // Session lama hanya berisi access token; login ulang sekali untuk memperoleh refresh token.
      await storage.delete(key: ApiClient.accessTokenKey);
      await storage.delete(key: ApiClient.refreshTokenKey);
      if (!mounted) return;
      context.go('/login');
    }
  }

  @override
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

final _router = GoRouter(
  // [BUG-053] FIX: initialLocation sekarang ke /splash yang akan redirect secara cerdas
  initialLocation: '/splash',
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
      builder: (context, state) =>
          TicketTemplateScreen(eventId: state.pathParameters['id']!),
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
      builder: (context, state) => ReviewDetailScreen(
        participantData: state.extra as Map<String, dynamic>,
      ),
    ),
  ],
);

class EventGateAdminApp extends ConsumerWidget {
  const EventGateAdminApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Ticket-In',
      theme: AppTheme.lightTheme,
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}
