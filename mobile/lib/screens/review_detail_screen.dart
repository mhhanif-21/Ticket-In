import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_colors.dart';
import '../services/admin_service.dart';
import '../utils/participant_answers.dart';

class ReviewDetailScreen extends StatefulWidget {
  final Map<String, dynamic> participantData;
  final AdminService? adminService;
  final bool refreshFromServer;

  const ReviewDetailScreen({
    super.key,
    required this.participantData,
    this.adminService,
    this.refreshFromServer = false,
  });

  @override
  State<ReviewDetailScreen> createState() => _ReviewDetailScreenState();
}

class _ReviewDetailScreenState extends State<ReviewDetailScreen> {
  bool _isProcessing = false;
  bool _isLoadingDetail = false;
  String? _detailLoadError;
  late Map<String, dynamic> _participantData;

  AdminService get _adminService => widget.adminService ?? AdminService();

  @override
  void initState() {
    super.initState();
    _participantData = Map<String, dynamic>.from(widget.participantData);
    if (widget.refreshFromServer && _participantId != null) {
      _loadLatestDetail();
    }
  }

  Future<void> _loadLatestDetail() async {
    final registrationId = _participantId;
    if (registrationId == null) return;
    if (mounted) {
      setState(() {
        _isLoadingDetail = true;
        _detailLoadError = null;
      });
    }
    try {
      final latest = await _adminService.getParticipantDetail(registrationId);
      if (!mounted || _participantId != registrationId) return;
      setState(() {
        _participantData = {
          ..._participantData,
          ...latest,
          'id': registrationId,
        };
        _isLoadingDetail = false;
      });
    } catch (_) {
      if (!mounted) return;
      // The list row remains the usable fallback. Never replace the detail
      // body with a final-status/blank state when the refresh is unavailable.
      setState(() {
        _isLoadingDetail = false;
        _detailLoadError = 'Data terbaru belum dapat dimuat.';
      });
    }
  }

  void _updateStatus(String status) async {
    if (_currentStatus() != 'Pending') return;
    final registrationId = _participantId;
    if (registrationId == null) return;
    setState(() => _isProcessing = true);
    try {
      final action = status == 'Accepted' ? 'Approve' : 'Reject';
      await _adminService.reviewParticipant(registrationId, action);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Status berhasil diubah menjadi $status')),
        );
        Navigator.pop(context, status);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Gagal: $e')));
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  void _retryTicket() async {
    final registrationId = _participantId;
    if (registrationId == null) return;
    setState(() => _isProcessing = true);
    try {
      await _adminService.retryTicketGeneration(registrationId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Retry penerbitan tiket berhasil dikirim'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Gagal retry tiket: $e')));
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _showParticipantImage(ParticipantFileResource resource) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return Dialog(
          backgroundColor: Colors.black,
          insetPadding: const EdgeInsets.all(16),
          child: Stack(
            children: [
              InteractiveViewer(
                minScale: 0.5,
                maxScale: 4,
                child: AspectRatio(
                  aspectRatio: 1,
                  child: Image.network(
                    resource.url.toString(),
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) => const Center(
                      child: Text(
                        'Foto belum dapat ditampilkan.',
                        style: TextStyle(color: Colors.white),
                      ),
                    ),
                    loadingBuilder: (context, child, progress) {
                      if (progress == null) return child;
                      return const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      );
                    },
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: IconButton(
                  tooltip: 'Tutup',
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  icon: const Icon(Icons.close, color: Colors.white),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openParticipantFile(ParticipantAnswerRow row) async {
    if (!mounted) return;
    final registrationId = _participantId;
    if (registrationId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Data pendaftar tidak tersedia.')),
      );
      return;
    }
    setState(() => _isProcessing = true);
    try {
      final resource = await _adminService.getParticipantFile(
        registrationId,
        row.fieldKey,
      );
      if (resource.isImage) {
        if (mounted) await _showParticipantImage(resource);
      } else {
        final url = resource.url;
        if (!await canLaunchUrl(url) ||
            !await launchUrl(url, mode: LaunchMode.externalApplication)) {
          throw Exception('Aplikasi tidak dapat membuka ${resource.fileName}.');
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Gagal membuka berkas: $e')));
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Color _getStatusBgColor(String status) {
    switch (status) {
      case 'Accepted':
        return const Color(0xFF000000).withValues(alpha: 0.1);
      case 'Rejected':
        return const Color(0xFFBA1A1A).withValues(alpha: 0.1);
      default:
        return Colors.orange.withValues(alpha: 0.1);
    }
  }

  Color _getStatusTextColor(String status) {
    switch (status) {
      case 'Accepted':
        return const Color(0xFF000000);
      case 'Rejected':
        return const Color(0xFFBA1A1A);
      default:
        return Colors.orange.shade800;
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentStatus = _currentStatus();
    final ticketJobStatus = _participantValue('ticketJobStatus')?.toString();
    final participantName = _textValue(
      _participantValue('name'),
      fallback: 'Unknown',
    );
    final answerRows = buildParticipantAnswerRows(
      answers: _participantValue('answers'),
      answerFieldLabels: _participantValue('answerFieldLabels'),
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: AppColors.onSurface),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Review Pendaftar',
          style: TextStyle(
            color: AppColors.onSurface,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        centerTitle: true,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: AppColors.outlineVariant, height: 1.0),
        ),
      ),
      // Status only changes the footer actions. Every registration status
      // must share this same complete read-only detail body.
      body: SingleChildScrollView(
        key: const ValueKey('review-detail-content'),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_isLoadingDetail) const LinearProgressIndicator(minHeight: 2),
            if (_detailLoadError != null) ...[
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _detailLoadError!,
                      style: const TextStyle(color: AppColors.onSurfaceVariant),
                    ),
                  ),
                  TextButton(
                    onPressed: _isLoadingDetail ? null : _loadLatestDetail,
                    child: const Text('Coba lagi'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
            ],
            Center(
              child: Column(
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceVariant,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.outlineVariant),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      participantName.isNotEmpty ? participantName[0] : '?',
                      style: const TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.w600,
                        color: AppColors.secondary,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    participantName,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w600,
                      color: AppColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: _getStatusBgColor(currentStatus),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: _getStatusBgColor(currentStatus),
                      ),
                    ),
                    child: Text(
                      currentStatus,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: _getStatusTextColor(currentStatus),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),
            const Text(
              'Informasi Dasar',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.onSurface,
              ),
            ),
            const SizedBox(height: 16),
            _buildDetailRow('Email', _textValue(_participantValue('email'))),
            const SizedBox(height: 12),
            _buildDetailRow(
              'Waktu Daftar',
              _textValue(_participantValue('createdAt')),
            ),
            const SizedBox(height: 32),
            const Text(
              'Jawaban Form',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.onSurface,
              ),
            ),
            const SizedBox(height: 16),
            if (answerRows.isEmpty)
              _buildDetailRow('Jawaban', '-')
            else
              ...answerRows.map((row) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildDetailRow(row.label, row.value),
                      if (row.isFile)
                        TextButton.icon(
                          onPressed: _isProcessing
                              ? null
                              : () => _openParticipantFile(row),
                          icon: Icon(
                            row.isImage
                                ? Icons.image_outlined
                                : Icons.open_in_new,
                            size: 16,
                          ),
                          label: Text(
                            row.isImage ? 'Lihat foto' : 'Buka/unduh PDF',
                          ),
                        ),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
      // [MOB-BUG-012] FIX: Container di luar SafeArea agar warna solid sampai tepi layar
      bottomNavigationBar: Container(
        key: const ValueKey('review-detail-bottom-action'),
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(top: BorderSide(color: AppColors.outlineVariant)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: currentStatus == 'Pending'
                ? Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _isProcessing
                              ? null
                              : () => _updateStatus('Rejected'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.error,
                            side: const BorderSide(color: AppColors.error),
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            'Tolak',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _isProcessing
                              ? null
                              : () => _updateStatus('Accepted'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: AppColors.onPrimary,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: _isProcessing
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    color: AppColors.onPrimary,
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Text(
                                  'Setujui',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                        ),
                      ),
                    ],
                  )
                : Column(
                    // A bottomNavigationBar receives the Scaffold's full
                    // vertical constraint. Keep the final-status footer
                    // content-sized so it cannot consume the detail body.
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        _statusMessage(currentStatus),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                      if (currentStatus == 'Accepted' &&
                          (ticketJobStatus == null ||
                              ticketJobStatus == 'failed')) ...[
                        const SizedBox(height: 12),
                        OutlinedButton(
                          onPressed: _isProcessing ? null : _retryTicket,
                          child: _isProcessing
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Text('Retry Penerbitan Tiket'),
                        ),
                      ],
                    ],
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: AppColors.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(fontSize: 16, color: AppColors.onSurface),
        ),
      ],
    );
  }

  String _textValue(Object? value, {String fallback = '-'}) {
    if (value == null) return fallback;
    final text = value.toString().trim();
    return text.isEmpty ? fallback : text;
  }

  Object? _participantValue(String camelCase) {
    final snakeCase = camelCase.replaceAllMapped(
      RegExp(r'[A-Z]'),
      (match) => '_${match.group(0)!.toLowerCase()}',
    );
    return _participantData[camelCase] ?? _participantData[snakeCase];
  }

  String? get _participantId {
    final value =
        _participantData['id'] ??
        _participantData['registrationId'] ??
        _participantData['registration_id'];
    final id = value?.toString().trim();
    return id == null || id.isEmpty ? null : id;
  }

  String _statusMessage(String status) {
    switch (status) {
      case 'Accepted':
        return 'Peserta telah diterima.';
      case 'Rejected':
        return 'Peserta telah ditolak.';
      case 'Draft':
        return 'Peserta masih berupa draft.';
      default:
        return 'Tidak ada aksi review untuk status ini.';
    }
  }

  String _currentStatus() {
    final raw =
        _participantValue('status') ??
        _participantData['registrationStatus'] ??
        _participantData['registration_status'];
    switch (raw?.toString().trim().toLowerCase()) {
      case 'draft':
        return 'Draft';
      case 'pending':
        return 'Pending';
      case 'accepted':
        return 'Accepted';
      case 'rejected':
        return 'Rejected';
      default:
        return raw?.toString().trim().isNotEmpty == true
            ? raw!.toString().trim()
            : 'Pending';
    }
  }
}
