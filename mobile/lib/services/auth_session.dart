import 'package:flutter/foundation.dart';

import 'api_client.dart';

enum AuthSessionStatus { initializing, authenticated, unauthenticated }

/// Single source of truth for routes that require an authenticated admin.
///
/// The API client broadcasts a refresh failure through [SessionInvalidationNotifier],
/// so a 401 caused by an expired refresh token sends every protected route back to
/// login instead of leaving the user on a broken screen.
class AuthSessionController extends ChangeNotifier {
  AuthSessionController({
    ApiClient? apiClient,
    SessionInvalidationNotifier? sessionEvents,
  }) : _sessionEvents = sessionEvents ?? ApiClient.sessionEvents,
       _apiClient =
           apiClient ??
           ApiClient(sessionEvents: sessionEvents ?? ApiClient.sessionEvents) {
    _sessionEvents.addListener(_handleInvalidation);
  }

  final ApiClient _apiClient;
  final SessionInvalidationNotifier _sessionEvents;
  AuthSessionStatus _status = AuthSessionStatus.initializing;

  AuthSessionStatus get status => _status;
  bool get isAuthenticated => _status == AuthSessionStatus.authenticated;

  Future<void> bootstrap() async {
    final restored = await _apiClient.restoreSession();
    if (_status == AuthSessionStatus.unauthenticated && !restored) return;
    _setStatus(
      restored
          ? AuthSessionStatus.authenticated
          : AuthSessionStatus.unauthenticated,
    );
  }

  void markAuthenticated() => _setStatus(AuthSessionStatus.authenticated);

  Future<void> signOut() async {
    await _apiClient.clearSession();
    _setStatus(AuthSessionStatus.unauthenticated);
  }

  void _handleInvalidation() {
    _setStatus(AuthSessionStatus.unauthenticated);
  }

  void _setStatus(AuthSessionStatus nextStatus) {
    if (_status == nextStatus) return;
    _status = nextStatus;
    notifyListeners();
  }

  @override
  void dispose() {
    _sessionEvents.removeListener(_handleInvalidation);
    super.dispose();
  }
}
