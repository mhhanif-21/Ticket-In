import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_colors.dart';
import '../services/admin_service.dart';

final adminServiceProvider = Provider((ref) => AdminService());
final executiveStatsProvider = FutureProvider((ref) {
  final service = ref.read(adminServiceProvider);
  return service.getDashboardStats();
});

class ExecutiveOversightScreen extends ConsumerWidget {
  const ExecutiveOversightScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(executiveStatsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.onSurfaceVariant),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Executive Oversight',
          style: TextStyle(
            color: AppColors.primary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Laporan Eksekutif',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w600,
                color: AppColors.onBackground,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Ringkasan tingkat tinggi untuk pemantauan strategis.',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),

            statsAsync.when(
              data: (data) => _buildStatsContent(data),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: AppColors.error))),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsContent(Map<String, dynamic> data) {
    // Calculate overall conversion if possible
    final int totalReg = data['total_registrations'] ?? 0;
    final int totalPresent = data['total_present'] ?? 0;
    final String conversion = totalReg > 0 ? ((totalPresent / totalReg) * 100).toStringAsFixed(1) : '0.0';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: _buildSummaryCard('Total Acara', data['total_events']?.toString() ?? '0', Icons.event)),
            const SizedBox(width: 12),
            Expanded(child: _buildSummaryCard('Kehadiran', '$conversion%', Icons.analytics)),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _buildSummaryCard('Pendaftar', totalReg.toString(), Icons.groups)),
            const SizedBox(width: 12),
            Expanded(child: _buildSummaryCard('Hadir', totalPresent.toString(), Icons.how_to_reg)),
          ],
        ),
        const SizedBox(height: 24),
        const Text(
          'Acara Mendatang',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.onSurface),
        ),
        const SizedBox(height: 12),
        ...((data['recent_events'] as List<dynamic>?) ?? []).map((ev) {
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.outlineVariant),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.03),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                )
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: 50, height: 50,
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.bar_chart, color: AppColors.primary),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ev['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16, color: AppColors.onSurface)),
                      const SizedBox(height: 4),
                      Text('${ev['date']?.substring(0,10) ?? ''} • ${ev['location'] ?? ''}', style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.secondaryContainer,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'Kapasitas: ${ev['capacity'] ?? 0}',
                    style: const TextStyle(color: AppColors.onSecondaryContainer, fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ],
    );
  }

  Widget _buildSummaryCard(String title, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.02),
            blurRadius: 10,
            offset: const Offset(0, 4),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.primary, size: 24),
          const SizedBox(height: 12),
          Text(
            value,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
