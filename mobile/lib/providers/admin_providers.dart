// [MOB-BUG-013] FIX: Sentralisasi provider agar tidak duplikat di 4 file screen
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/admin_service.dart';
import '../services/auth_session.dart';

/// Provider singleton untuk AdminService.
/// Import file ini di semua screen yang membutuhkan AdminService.
final adminServiceProvider = Provider((ref) => AdminService());

final authSessionProvider = ChangeNotifierProvider<AuthSessionController>((
  ref,
) {
  final controller = AuthSessionController();
  controller.bootstrap();
  return controller;
});
