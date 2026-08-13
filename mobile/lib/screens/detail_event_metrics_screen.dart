import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';
import '../services/admin_service.dart';

final adminServiceProvider = Provider((ref) => AdminService());

final eventStatsProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, eventId) {
  final service = ref.read(adminServiceProvider);
  return service.getEventStats(eventId);
});

class DetailEventMetricsScreen extends ConsumerWidget {
  final String eventId;

  const DetailEventMetricsScreen({super.key, required this.eventId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(eventStatsProvider(eventId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: statsAsync.when(
        data: (data) => _buildContent(context, data),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(
          child: Text('Error: $err', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, Map<String, dynamic> data) {
    return CustomScrollView(
      slivers: [
        _buildHeroSection(context, data),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Dashboard Metrik',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.onBackground,
                  ),
                ),
                const SizedBox(height: 16),
                _buildMetricsGrid(data),
                const SizedBox(height: 32),

                const Text(
                  'Manajemen Acara',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.onBackground,
                  ),
                ),
                const SizedBox(height: 16),
                _buildManagementMenu(context),

                const SizedBox(height: 40),
                _buildDangerZone(context),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHeroSection(BuildContext context, Map<String, dynamic> data) {
    final String title = data['name'] ?? 'Untitled Event';
    final String rawDate = data['date'] ?? '';
    String formattedDate = '';
    if (rawDate.isNotEmpty) {
      try {
        final dateObj = DateTime.parse(rawDate);
        formattedDate = DateFormat('dd MMM yyyy, HH:mm').format(dateObj);
      } catch (_) {
        formattedDate = rawDate;
      }
    }

    final String? posterUrl = data['posterUrl'];

    return SliverAppBar(
      expandedHeight: 280,
      pinned: true,
      backgroundColor: AppColors.surface,
      leading: Padding(
        padding: const EdgeInsets.all(8.0),
        child: CircleAvatar(
          backgroundColor: Colors.black.withOpacity(0.5),
          child: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
      ),
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            if (posterUrl != null && posterUrl.isNotEmpty)
              Image.network(posterUrl, fit: BoxFit.cover)
            else
              Container(color: AppColors.primary),

            // Gradient Overlay
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity(0.2),
                    Colors.black.withOpacity(0.8),
                  ],
                ),
              ),
            ),

            // Content
            Positioned(
              bottom: 20,
              left: 20,
              right: 20,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.green,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text(
                      'ACTIVE EVENT',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.0,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.calendar_today, color: Colors.white70, size: 14),
                      const SizedBox(width: 6),
                      Text(
                        formattedDate,
                        style: const TextStyle(color: Colors.white70, fontSize: 14),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricsGrid(Map<String, dynamic> data) {
    final int capacity = data['total_capacity'] ?? 0;
    final int pending = data['pending'] ?? 0;
    final int accepted = data['accepted'] ?? 0;
    final int present = data['present'] ?? 0;
    final int totalReg = pending + accepted;

    return GridView.extent(
      crossAxisSpacing: 16,
      mainAxisSpacing: 16,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      maxCrossAxisExtent: 220,
      mainAxisExtent: 220,
      children: [
        _buildMetricCard(
          title: 'Total Pendaftar',
          value: totalReg.toString(),
          icon: Icons.groups,
          subtext: 'Dari $capacity Kapasitas',
          iconColor: Colors.blue,
        ),
        _buildMetricCard(
          title: 'Pending',
          value: pending.toString(),
          icon: Icons.hourglass_empty,
          subtext: 'Menunggu review',
          iconColor: Colors.orange,
          showActionReq: pending > 0,
        ),
        _buildMetricCardWithProgress(
          title: 'Diterima',
          value: accepted.toString(),
          icon: Icons.check_circle,
          iconColor: Colors.green,
          current: accepted,
          total: totalReg > 0 ? totalReg : 1,
        ),
        _buildMetricCardWithProgress(
          title: 'Sudah Check-in',
          value: present.toString(),
          icon: Icons.how_to_reg,
          iconColor: Colors.purple,
          current: present,
          total: accepted > 0 ? accepted : 1,
        ),
      ],
    );
  }

  Widget _buildMetricCard({
    required String title,
    required String value,
    required IconData icon,
    required String subtext,
    required Color iconColor,
    bool showActionReq = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            runSpacing: 4,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: iconColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: iconColor, size: 20),
              ),
              if (showActionReq)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.red.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    'Action Req.',
                    style: TextStyle(color: Colors.red, fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                ),
            ],
          ),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: AppColors.onSurface),
          ),
          const SizedBox(height: 2),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 2),
          Text(
            subtext,
            style: const TextStyle(fontSize: 11, color: AppColors.outline),
          ),
        ],
      ),
    );
  }

  Widget _buildMetricCardWithProgress({
    required String title,
    required String value,
    required IconData icon,
    required Color iconColor,
    required int current,
    required int total,
  }) {
    final double percentage = (current / total).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: iconColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: AppColors.onSurface),
          ),
          const SizedBox(height: 2),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: percentage,
              backgroundColor: iconColor.withOpacity(0.1),
              valueColor: AlwaysStoppedAnimation<Color>(iconColor),
              minHeight: 6,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${(percentage * 100).toStringAsFixed(1)}%',
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: iconColor),
          ),
        ],
      ),
    );
  }

  Widget _buildManagementMenu(BuildContext context) {
    return Column(
      children: [
        _buildMenuTile(
          context,
          icon: Icons.edit_note,
          title: 'Edit Detail Acara',
          subtitle: 'Ubah informasi dasar, tanggal, dan lokasi',
          onTap: () => context.push('/edit-event/$eventId'),
        ),
        _buildMenuTile(
          context,
          icon: Icons.dynamic_form,
          title: 'Kelola Form Pendaftaran',
          subtitle: 'Kustomisasi field dan pertanyaan registrasi',
          onTap: () => context.push('/form-builder/$eventId'),
        ),
        _buildMenuTile(
          context,
          icon: Icons.people_alt,
          title: 'Daftar & Review Peserta',
          subtitle: 'Terima atau tolak pendaftar yang pending',
          onTap: () => context.push('/participants/$eventId'),
        ),
        _buildMenuTile(
          context,
          icon: Icons.admin_panel_settings,
          title: 'Kelola Akses Panitia',
          subtitle: 'Atur PIN volunteer untuk check-in',
          onTap: () => context.push('/access-management/$eventId'),
        ),
      ],
    );
  }

  Widget _buildMenuTile(BuildContext context, {required IconData icon, required String title, required String subtitle, required VoidCallback onTap}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppColors.primaryContainer,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: AppColors.primary),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
        trailing: const Icon(Icons.chevron_right, color: AppColors.outline),
        onTap: onTap,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }

  Widget _buildDangerZone(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.red.withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.red.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.red),
              SizedBox(width: 8),
              Text(
                'Danger Zone',
                style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Tindakan di bawah ini tidak dapat dibatalkan. Berhati-hatilah.',
            style: TextStyle(color: Colors.red, fontSize: 12),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.red,
                side: const BorderSide(color: Colors.red),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () {
                // Confirm dialog
              },
              child: const Text('BATALKAN ACARA', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.5)),
            ),
          ),
        ],
      ),
    );
  }
}
