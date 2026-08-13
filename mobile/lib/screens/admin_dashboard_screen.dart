import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_colors.dart';
import '../services/admin_service.dart';

final adminServiceProvider = Provider((ref) => AdminService());
final globalDashboardStatsProvider = FutureProvider((ref) {
  final service = ref.read(adminServiceProvider);
  return service.getDashboardStats();
});

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(globalDashboardStatsProvider);

    return Scaffold(
      // [BUG-042] FIX: Hapus extendBody:true agar Navbar tidak menutupi konten list
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        centerTitle: false,
        titleSpacing: 20,
        automaticallyImplyLeading: false, // [BUG-061] FIX: Cegah tombol Back muncul di root screen
        title: const Text(
          'Event Gate',
          style: TextStyle(
            color: AppColors.primary,
            fontSize: 20,
            fontWeight: FontWeight.bold,
            letterSpacing: -0.01,
          ),
        ),
        // [BUG-041] FIX: Hapus ikon profil dari AppBar Dashboard
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: AppColors.outlineVariant, height: 1.0),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.only(left: 20, right: 20, top: 24, bottom: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Halo, Admin',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w600,
                color: AppColors.onBackground,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Berikut adalah ringkasan operasional hari ini.',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),

            statsAsync.when(
              data: (data) => _buildStatsContent(data),
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
              error: (err, stack) => Text('Error: $err', style: const TextStyle(color: AppColors.error)),
            ),
          ],
        ),
      ),
      // [BUG-042] FIX: Navbar sekarang full-block menempel di bawah (bukan floating pill)
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border(
            top: BorderSide(color: AppColors.outlineVariant, width: 1.0),
          ),
        ),
        child: SafeArea(
          child: SizedBox(
            height: 64,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildNavItem(Icons.dashboard, 'Dashboard', true, () {}),
                // [BUG-044] FIX: Route ke /home (Daftar Acara), bukan ke / yang tidak terdefinisi
                _buildNavItem(Icons.calendar_today, 'Event', false, () => context.go('/home')),
                // [BUG-043] FIX: Settings menampilkan SnackBar "Segera Hadir" alih-alih diam
                _buildNavItem(Icons.settings, 'Settings', false, () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('⚙️ Pengaturan — Segera Hadir'),
                      duration: Duration(seconds: 2),
                    ),
                  );
                }),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(IconData icon, String label, bool isActive, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
        decoration: isActive
            ? BoxDecoration(
                color: AppColors.primaryContainer,
                borderRadius: BorderRadius.circular(12),
              )
            : null,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              color: isActive ? AppColors.onPrimaryContainer : AppColors.onSurfaceVariant,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: isActive ? AppColors.onPrimaryContainer : AppColors.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsContent(Map<String, dynamic> data) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 1,
                child: _buildStatCard('Event\nDibuat', Icons.event_available, data['total_events']?.toString() ?? '0'),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 1,
                child: Column(
                  children: [
                    _buildStatCard('Pendaftar', Icons.groups, data['total_registrations']?.toString() ?? '0'),
                    const SizedBox(height: 8),
                    _buildStatCard('Hadir', Icons.how_to_reg, data['total_present']?.toString() ?? '0'),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 24),
        // [BUG-040] FIX: Hapus TextButton "Lihat Semua" — cukup tampilkan judul section
        const Text(
          '5 Event Terakhir',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.onSurface),
        ),
        const SizedBox(height: 8),
        ...((data['recent_events'] as List<dynamic>?) ?? []).map((ev) {
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.outlineVariant),
            ),
            child: Row(
              children: [
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceVariant,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.campaign, color: AppColors.primary),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ev['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16, color: AppColors.onSurface)),
                      const SizedBox(height: 2),
                      Text('${ev['date']?.substring(0,10) ?? ''} • ${ev['location'] ?? ''}', style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 14)),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // [BUG-039] FIX: Ganti ev['capacity'] → ev['registrants_count']
                    // capacity = batas kuota, bukan jumlah pendaftar aktual
                    Text(
                      (ev['registrants_count'] ?? 0).toString(),
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16, color: AppColors.onSurface),
                    ),
                    const Text('PENDAFTAR', style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 11, fontWeight: FontWeight.w600)),
                  ],
                ),
              ],
            ),
          );
        }).toList(),
      ],
    );
  }

  Widget _buildStatCard(String title, IconData icon, String value) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            right: -20,
            top: -20,
            child: Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.05),
                shape: BoxShape.circle,
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(icon, color: AppColors.primary, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      title.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: AppColors.onSurfaceVariant,
                        letterSpacing: 1.0,
                        height: 1.2,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w600,
                  color: AppColors.onSurface,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
