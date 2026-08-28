import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';
import '../services/event_service.dart';
// [MOB-BUG-013] FIX: Import dari provider terpusat
import '../providers/admin_providers.dart';
import '../widgets/adaptive_event_image.dart';
import '../models/poster_aspect.dart';

final eventStatsProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, String>((ref, eventId) {
      final service = ref.read(adminServiceProvider);
      return service.getEventStats(eventId);
    });

class DetailEventMetricsScreen extends ConsumerStatefulWidget {
  final String eventId;

  const DetailEventMetricsScreen({super.key, required this.eventId});

  @override
  ConsumerState<DetailEventMetricsScreen> createState() =>
      _DetailEventMetricsScreenState();
}

class _DetailEventMetricsScreenState
    extends ConsumerState<DetailEventMetricsScreen> {
  final PageController _heroMediaController = PageController();
  int _heroMediaIndex = 0;

  String get eventId => widget.eventId;

  @override
  Widget build(BuildContext context) {
    final statsAsync = ref.watch(eventStatsProvider(eventId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: statsAsync.when(
        // [MOB-BUG-011] FIX: Thread ref ke _buildContent untuk invalidasi provider setelah navigasi
        data: (data) => _buildContent(context, ref, data),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(
          child: Text(
            'Error: $err',
            style: const TextStyle(color: AppColors.error),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _heroMediaController.dispose();
    super.dispose();
  }

  // [MOB-BUG-011] FIX: ref diteruskan agar management menu bisa invalidate provider
  Widget _buildContent(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> data,
  ) {
    return CustomScrollView(
      slivers: [
        _buildHeroSection(context, data),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildEventMetadata(data),
                const SizedBox(height: 32),
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
                _buildManagementMenu(context, ref),

                _buildPublicationControl(context, ref, data),
                const SizedBox(height: 40),
                _buildDangerZone(
                  context,
                  data['status']?.toString() ?? 'Draft',
                ),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ],
    );
  }

  List<String> _heroMediaUrls(Map<String, dynamic> data) {
    final urls = <String>[];
    final rawMedia = data['media'];
    var hasCover = false;
    if (rawMedia is List) {
      for (final rawItem in rawMedia) {
        if (rawItem is! Map) continue;
        final role = rawItem['role']?.toString().trim().toLowerCase();
        if (role == 'cover') hasCover = true;
        final url = (rawItem['public_url'] ?? rawItem['publicUrl'])
            ?.toString()
            .trim();
        if (url != null && url.isNotEmpty && !urls.contains(url)) {
          urls.add(url);
        }
      }
    }

    final legacyPoster = data['posterUrl']?.toString().trim();
    if (legacyPoster != null &&
        legacyPoster.isNotEmpty &&
        (!hasCover || urls.isEmpty) &&
        !urls.contains(legacyPoster)) {
      urls.insert(0, legacyPoster);
    }
    return urls;
  }

  String _formatEventDate(Object? rawValue) {
    final rawDate = rawValue?.toString() ?? '';
    if (rawDate.isEmpty) return '-';
    try {
      return DateFormat('dd MMM yyyy, HH:mm').format(DateTime.parse(rawDate));
    } catch (_) {
      return rawDate;
    }
  }

  String _metadataValue(Object? value) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? '-' : text;
  }

  Widget _buildEventMetadata(Map<String, dynamic> data) {
    final status = _metadataValue(data['status']);
    return Container(
      key: const ValueKey('event-metadata-section'),
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Informasi Acara',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppColors.onBackground,
            ),
          ),
          const SizedBox(height: 14),
          _buildMetadataRow('Nama Acara', _metadataValue(data['name'])),
          _buildMetadataRow('Deskripsi', _metadataValue(data['description'])),
          _buildMetadataRow('Lokasi', _metadataValue(data['location'])),
          _buildMetadataRow('Tanggal & Waktu', _formatEventDate(data['date'])),
          _buildMetadataRow(
            'Kapasitas',
            '${_metadataValue(data['total_capacity'])} peserta',
          ),
          _buildMetadataRow(
            'Mode Registrasi',
            _metadataValue(
              data['registrationMode'] ?? data['registration_mode'],
            ),
          ),
          _buildMetadataRow('Status', status),
        ],
      ),
    );
  }

  Widget _buildMetadataRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: const TextStyle(fontSize: 14, color: AppColors.onSurface),
          ),
        ],
      ),
    );
  }

  Widget _buildHeroSection(BuildContext context, Map<String, dynamic> data) {
    final title = _metadataValue(data['name']);
    final formattedDate = _formatEventDate(data['date']);
    final mediaUrls = _heroMediaUrls(data);
    final posterAspectRatio = posterAspectModeFromJson(
      data['posterAspectMode'] ?? data['poster_aspect_mode'],
    ).ratio;
    final status = data['status']?.toString() ?? 'Draft';
    final statusLabel = switch (status) {
      'Published' => 'PUBLISHED EVENT',
      'Cancelled' => 'CANCELLED EVENT',
      _ => 'DRAFT EVENT',
    };
    final statusColor = switch (status) {
      'Published' => AppColors.primary,
      'Cancelled' => Colors.red,
      _ => Colors.orange,
    };

    return SliverAppBar(
      expandedHeight: 280,
      pinned: true,
      backgroundColor: AppColors.surface,
      leading: Padding(
        padding: const EdgeInsets.all(8.0),
        child: CircleAvatar(
          backgroundColor: Colors.black.withValues(alpha: 0.5),
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
            if (mediaUrls.isNotEmpty)
              PageView.builder(
                key: const ValueKey('event-detail-media-carousel'),
                controller: _heroMediaController,
                itemCount: mediaUrls.length,
                onPageChanged: (index) {
                  if (mounted) setState(() => _heroMediaIndex = index);
                },
                itemBuilder: (context, index) => AdaptiveEventImage(
                  image: NetworkImage(mediaUrls[index]),
                  frameAspectRatio: posterAspectRatio,
                  fit: BoxFit.contain,
                  blurredBackdrop: false,
                  expand: true,
                  backgroundColor: AppColors.surfaceVariant,
                ),
              )
            else
              Container(color: AppColors.primary),

            if (mediaUrls.length > 1)
              Positioned(
                top: 18,
                right: 18,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${(_heroMediaIndex.clamp(0, mediaUrls.length - 1)) + 1} / ${mediaUrls.length}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),

            // Gradient Overlay
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.2),
                    Colors.black.withValues(alpha: 0.8),
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      statusLabel,
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
                      const Icon(
                        Icons.calendar_today,
                        color: Colors.white70,
                        size: 14,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        formattedDate,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 14,
                        ),
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
          iconColor: AppColors.primary,
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
          ),
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.red.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    'Action Req.',
                    style: TextStyle(
                      color: Colors.red,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
            ],
          ),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.onSurfaceVariant,
            ),
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
          ),
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
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.onSurfaceVariant,
            ),
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
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: iconColor,
            ),
          ),
        ],
      ),
    );
  }

  // [MOB-BUG-011] FIX: ref diterima agar bisa invalidate provider setelah navigasi
  Widget _buildManagementMenu(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        _buildMenuTile(
          context,
          icon: Icons.edit_note,
          title: 'Edit Detail Acara',
          subtitle: 'Ubah informasi dasar, tanggal, dan lokasi',
          onTap: () async {
            await context.push('/edit-event/$eventId');
            if (!context.mounted) return;
            ref.invalidate(eventStatsProvider(eventId));
          },
        ),
        _buildMenuTile(
          context,
          icon: Icons.dynamic_form,
          title: 'Kelola Form Pendaftaran',
          subtitle: 'Kustomisasi field dan pertanyaan registrasi',
          onTap: () async {
            await context.push('/form-builder/$eventId');
            if (!context.mounted) return;
            ref.invalidate(eventStatsProvider(eventId));
          },
        ),
        _buildMenuTile(
          context,
          icon: Icons.people_alt,
          title: 'Daftar & Review Peserta',
          subtitle: 'Terima atau tolak pendaftar yang pending',
          onTap: () async {
            await context.push('/participants/$eventId');
            if (!context.mounted) return;
            ref.invalidate(eventStatsProvider(eventId));
          },
        ),
        _buildMenuTile(
          context,
          icon: Icons.admin_panel_settings,
          title: 'Kelola Akses Panitia',
          subtitle: 'Atur PIN volunteer untuk check-in',
          onTap: () async {
            await context.push('/access-management/$eventId');
            if (!context.mounted) return;
            ref.invalidate(eventStatsProvider(eventId));
          },
        ),
        _buildMenuTile(
          context,
          icon: Icons.confirmation_number_outlined,
          title: 'Template Tiket & Email',
          subtitle: 'Atur tampilan tiket dan email approval Manual Review',
          onTap: () async {
            await context.push('/ticket-template/$eventId');
            if (!context.mounted) return;
            ref.invalidate(eventStatsProvider(eventId));
          },
        ),
      ],
    );
  }

  Widget _buildPublicationControl(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> data,
  ) {
    if ((data['status']?.toString() ?? 'Draft') != 'Draft') {
      return const SizedBox.shrink();
    }

    return Container(
      key: const ValueKey('publish-event-control'),
      margin: const EdgeInsets.only(top: 28),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.primary.withOpacity(0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Publikasi Acara',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.onBackground,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Acara masih berupa draft dan belum terlihat oleh peserta. Publikasikan setelah form pendaftaran siap.',
            style: TextStyle(fontSize: 12, color: AppColors.onBackground),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              key: const ValueKey('publish-event-button'),
              icon: const Icon(Icons.public),
              label: const Text('PUBLIKASIKAN ACARA'),
              onPressed: () async {
                try {
                  await EventService().updateEvent(eventId, {
                    'status': 'Published',
                  });
                  if (!context.mounted) return;
                  ref.invalidate(eventStatsProvider(eventId));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Acara berhasil dipublikasikan.'),
                    ),
                  );
                } catch (e) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Gagal mempublikasikan acara: $e')),
                  );
                }
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required Function() onTap,
  }) {
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
          title: Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
          ),
          subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
          trailing: const Icon(Icons.chevron_right, color: AppColors.outline),
          onTap: onTap,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  Widget _buildDangerZone(BuildContext context, String status) {
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
                style: TextStyle(
                  color: Colors.red,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Tindakan di bawah ini tidak dapat dibatalkan. Berhati-hatilah.',
            style: TextStyle(color: Colors.red, fontSize: 12),
          ),
          if (status != 'Cancelled') ...[
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.red,
                  side: const BorderSide(color: Colors.red),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: () async {
                  // BUG-I FIX: Implementasi dialog konfirmasi + cancel via API
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Batalkan Acara?'),
                      content: const Text(
                        'Acara akan dibatalkan dan peserta tidak bisa mendaftar lagi. '
                        'Tindakan ini tidak dapat diurungkan.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Tidak'),
                        ),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.red,
                            foregroundColor: Colors.white,
                          ),
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Ya, Batalkan'),
                        ),
                      ],
                    ),
                  );
                  if (confirm != true || !context.mounted) return;
                  try {
                    await EventService().updateEvent(eventId, {
                      'status': 'Cancelled',
                    });
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Acara berhasil dibatalkan.'),
                      ),
                    );
                    // [MOB-BUG-002] FIX: pop agar home_screen .then() callback re-load events
                    context.pop();
                  } catch (e) {
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Gagal membatalkan acara: $e')),
                    );
                  }
                },
                child: const Text(
                  'BATALKAN ACARA',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.5,
                  ),
                ),
              ),
            ),
          ],
          // Bug 5 FIX: Tombol HAPUS EVENT permanen
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Hapus Acara?'),
                    content: const Text(
                      'Seluruh data acara, form, dan peserta akan DIHAPUS PERMANEN. '
                      'Tindakan ini tidak dapat dibatalkan.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Batal'),
                      ),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red[900],
                          foregroundColor: Colors.white,
                        ),
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text('Ya, Hapus Permanen'),
                      ),
                    ],
                  ),
                );
                if (confirm != true || !context.mounted) return;
                try {
                  await EventService().deleteEvent(eventId);
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Acara berhasil dihapus.')),
                  );
                  // [MOB-BUG-002] FIX: pop agar home_screen .then() callback re-load events
                  context.pop();
                } catch (e) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Gagal menghapus acara: $e')),
                  );
                }
              },
              child: const Text(
                'HAPUS ACARA PERMANEN',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.5,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
