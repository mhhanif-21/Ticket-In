import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:event_gate_admin/theme/app_colors.dart';
import 'package:event_gate_admin/theme/app_theme.dart';

void main() {
  test('mobile theme uses the neutral web palette', () {
    final scheme = AppTheme.lightTheme.colorScheme;

    expect(scheme.primary, const Color(0xFF000000));
    expect(scheme.primary, AppColors.primary);
    expect(scheme.surface, const Color(0xFFF9F9F9));
    expect(scheme.onSurface, const Color(0xFF1A1C1C));
    expect(scheme.outlineVariant, const Color(0xFFC4C7C7));
    expect(AppColors.primaryContainer, const Color(0xFFE5E2E1));
  });
}
