import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/event_model.dart';
import '../services/event_service.dart';
import '../services/api_client.dart';
import 'package:url_launcher/url_launcher.dart';

class AccessManagementScreen extends StatefulWidget {
  final String eventId;
  final EventService? eventService;

  const AccessManagementScreen({
    Key? key,
    required this.eventId,
    this.eventService,
  }) : super(key: key);

  @override
  _AccessManagementScreenState createState() => _AccessManagementScreenState();
}

class _AccessManagementScreenState extends State<AccessManagementScreen> {
  late final EventService _eventService;
  bool _isLoading = true;
  EventModel? _event;
  String? _newPin;
  int _qrAttempt = 0;

  bool get _isPublished => _event?.status.trim().toLowerCase() == 'published';

  @override
  void initState() {
    super.initState();
    _eventService = widget.eventService ?? EventService();
    _loadEvent();
  }

  Future<void> _loadEvent() async {
    try {
      final event = await _eventService.getEventDetail(widget.eventId);
      if (!mounted) return;
      setState(() {
        _event = event;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Gagal memuat acara: $e')));
      Navigator.pop(context);
    }
  }

  Future<void> _generatePin() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Konfirmasi Regenerasi PIN'),
        content: const Text(
          'PIN sebelumnya tidak akan valid lagi untuk panitia login. Lanjutkan?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFBA1A1A),
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text(
              'Ya, Regenerate',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );

    if (!mounted) return;
    if (confirm != true) return;

    setState(() => _isLoading = true);
    try {
      final pin = await _eventService.generatePin(widget.eventId);
      if (!mounted) return;
      setState(() {
        _newPin = pin;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Gagal membuat PIN: $e')));
      setState(() => _isLoading = false);
    }
  }

  void _copyText(String text) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Tautan disalin!')));
  }

  void _retryQr() {
    if (!mounted) return;
    setState(() => _qrAttempt++);
  }

  Widget _buildQrUnavailable({required VoidCallback onRetry}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.qr_code_2, size: 30, color: Color(0xFF777777)),
            const SizedBox(height: 4),
            const Text(
              'QR pendaftaran belum tersedia.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: Color(0xFF444748)),
            ),
            const SizedBox(height: 4),
            OutlinedButton(
              onPressed: onRetry,
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(80, 32),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                padding: const EdgeInsets.symmetric(horizontal: 8),
              ),
              child: const Text('Coba Lagi'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQrPreview(String? url) {
    return SizedBox.square(
      dimension: 220,
      child: Container(
        key: const ValueKey('registration-qr-preview'),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFC4C7C7)),
        ),
        child: url == null || url.isEmpty
            ? _buildQrUnavailable(onRetry: _loadEvent)
            : Image.network(
                key: ValueKey('$url-$_qrAttempt'),
                url,
                width: double.infinity,
                height: double.infinity,
                fit: BoxFit.contain,
                errorBuilder: (context, error, stackTrace) =>
                    _buildQrUnavailable(onRetry: _retryQr),
              ),
      ),
    );
  }

  Widget _buildUnpublishedState() {
    final cancelled = _event?.status.trim().toLowerCase() == 'cancelled';
    return Center(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFC4C7C7)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              cancelled ? Icons.block : Icons.lock_outline,
              size: 48,
              color: cancelled ? const Color(0xFFBA1A1A) : Colors.black,
            ),
            const SizedBox(height: 16),
            Text(
              cancelled ? 'Acara dibatalkan' : 'Acara belum dipublikasikan',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Color(0xFF1A1C1C),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              cancelled
                  ? 'Link pendaftaran, QR pendaftaran, dan akses scanner tidak tersedia untuk acara yang dibatalkan.'
                  : 'Link pendaftaran, QR pendaftaran, dan akses scanner akan tersedia setelah acara dipublikasikan.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 14,
                height: 1.4,
                color: Color(0xFF444748),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    const bgColor = Color(0xFFF9F9F9);
    const primaryColor = Color(0xFF000000);
    const onSurface = Color(0xFF1A1C1C);
    const onSurfaceVariant = Color(0xFF444748);
    const outlineVariant = Color(0xFFC4C7C7);
    const surfaceContainerLowest = Color(0xFFFFFFFF);
    const surfaceContainerLow = Color(0xFFF3F3F3);

    if (_isLoading) {
      return Scaffold(
        backgroundColor: bgColor,
        appBar: AppBar(
          title: const Text('Kelola Akses Acara'),
          backgroundColor: bgColor,
        ),
        body: const Center(
          child: CircularProgressIndicator(color: primaryColor),
        ),
      );
    }

    if (_event == null) {
      return Scaffold(
        backgroundColor: bgColor,
        appBar: AppBar(
          title: const Text('Kelola Akses Acara'),
          backgroundColor: bgColor,
        ),
        body: const Center(child: Text('Data tidak ditemukan')),
      );
    }

    if (!_isPublished) {
      return Scaffold(
        backgroundColor: bgColor,
        appBar: AppBar(
          title: const Text('Kelola Akses Acara'),
          backgroundColor: bgColor,
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: _buildUnpublishedState(),
        ),
      );
    }

    final regUrl = _event!.publicRegistrationUrl;
    // [MOB-BUG-009] FIX: Gunakan Uri.parse untuk manipulasi URL yang aman (bukan replaceAll)
    final baseUri = Uri.parse(ApiClient.baseUrl);
    final cleanSegments = baseUri.pathSegments
        .where((s) => s != 'api')
        .toList();
    final webBase = baseUri.replace(pathSegments: cleanSegments).toString();
    final scanUrl = '$webBase/${_event!.slug}/checkin';
    final qrUrl = _event!.publicQrCodeUrl;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: onSurfaceVariant),
        title: const Text(
          'Kelola Akses Acara',
          style: TextStyle(
            color: primaryColor,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: outlineVariant, height: 1.0),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Section A: Akses Pendaftaran Peserta
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: surfaceContainerLowest,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: outlineVariant),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Akses Pendaftaran Peserta',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: onSurface,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: surfaceContainerLow,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: outlineVariant),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            regUrl ?? 'Tautan pendaftaran belum tersedia.',
                            style: const TextStyle(
                              fontSize: 14,
                              color: onSurfaceVariant,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (regUrl != null)
                          InkWell(
                            onTap: () => _copyText(regUrl),
                            child: const Padding(
                              padding: EdgeInsets.all(4.0),
                              child: Icon(
                                Icons.content_copy,
                                color: primaryColor,
                                size: 20,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: Column(
                      children: [
                        _buildQrPreview(qrUrl),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          height: 40,
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.download, size: 18),
                            label: const Text(
                              'Download QR Pendaftaran',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: primaryColor,
                              side: const BorderSide(color: primaryColor),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            onPressed: qrUrl == null
                                ? null
                                : () async {
                                    // [BUG-069] FIX: Implementasi download/buka QR di browser via url_launcher
                                    final url = qrUrl;
                                    if (await canLaunchUrl(Uri.parse(url))) {
                                      if (!context.mounted) return;
                                      await launchUrl(
                                        Uri.parse(url),
                                        mode: LaunchMode.externalApplication,
                                      );
                                      if (!context.mounted) return;
                                      ScaffoldMessenger.of(
                                        context,
                                      ).showSnackBar(
                                        const SnackBar(
                                          content: Text(
                                            'Membuka browser untuk mengunduh QR...',
                                          ),
                                        ),
                                      );
                                    } else {
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(
                                          context,
                                        ).showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                              'Gagal membuka tautan QR',
                                            ),
                                          ),
                                        );
                                      }
                                    }
                                  },
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Section B: Akses Scanner Panitia
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: surfaceContainerLowest,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: outlineVariant),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Akses Scanner Panitia',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: onSurface,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: surfaceContainerLow,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: outlineVariant),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            scanUrl,
                            style: const TextStyle(
                              fontSize: 14,
                              color: onSurfaceVariant,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        InkWell(
                          onTap: () => _copyText(scanUrl),
                          child: const Padding(
                            padding: EdgeInsets.all(4.0),
                            child: Icon(
                              Icons.content_copy,
                              color: primaryColor,
                              size: 20,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 32),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F3F3),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFC4C7C7)),
                    ),
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Positioned(
                          right: -30,
                          top: -30,
                          child: Icon(
                            Icons.lock_outline,
                            size: 140,
                            color: const Color(0xFFE5E2E1).withOpacity(0.1),
                          ),
                        ),
                        Center(
                          child: Column(
                            children: [
                              // BUG-F FIX: Tampilkan instruksi jelas jika PIN belum di-generate
                              if (_newPin == null) ...[
                                const Icon(
                                  Icons.lock_outline,
                                  size: 40,
                                  color: Color(0xFF000000),
                                ),
                                const SizedBox(height: 12),
                                const Text(
                                  'PIN belum dibuat',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF1C1B1B),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                const Text(
                                  'Tap \'Generate PIN Baru\' di bawah',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Color(0xFF000000),
                                  ),
                                ),
                              ] else ...[
                                Text(
                                  _newPin!,
                                  style: const TextStyle(
                                    fontSize: 48,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 12.0,
                                    color: Color(0xFF1C1B1B),
                                    fontFamily: 'monospace',
                                  ),
                                ),
                                const SizedBox(height: 8),
                                const Text(
                                  'PIN AKTIF',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 2.0,
                                    color: Color(0xFF000000),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.refresh, size: 20),
                      label: const Text(
                        'Generate PIN Baru',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryColor,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      onPressed: _generatePin,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    '*Berikan URL dan PIN ini kepada relawan lapangan untuk login ke Web Scanner.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      fontStyle: FontStyle.italic,
                      color: onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
