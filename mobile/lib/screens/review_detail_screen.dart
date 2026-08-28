import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_colors.dart';
import '../services/admin_service.dart';
import '../utils/participant_answers.dart';

class ReviewDetailScreen extends StatefulWidget {
  final Map<String, dynamic> participantData;
  final AdminService? adminService;

  const ReviewDetailScreen({super.key, required this.participantData, this.adminService});

  @override
  State<ReviewDetailScreen> createState() => _ReviewDetailScreenState();
}

class _ReviewDetailScreenState extends State<ReviewDetailScreen> {
  bool _isProcessing = false;

  void _updateStatus(String status) async {
    if (widget.participantData['status']?.toString() != 'Pending') return;
    setState(() => _isProcessing = true);
    try {
      final action = status == 'Accepted' ? 'Approve' : 'Reject';
      await (widget.adminService ?? AdminService()).reviewParticipant(widget.participantData['id'], action);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Status berhasil diubah menjadi $status')),
        );
        Navigator.pop(context, status);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  void _retryTicket() async {
    setState(() => _isProcessing = true);
    try {
      await (widget.adminService ?? AdminService()).retryTicketGeneration(widget.participantData['id']);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Retry penerbitan tiket berhasil dikirim')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal retry tiket: $e')),
        );
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
    setState(() => _isProcessing = true);
    try {
      final resource = await (widget.adminService ?? AdminService()).getParticipantFile(
        widget.participantData['id'].toString(),
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal membuka berkas: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Color _getStatusBgColor(String status) {
    switch (status) {
      case 'Accepted': return const Color(0xFF000000).withValues(alpha: 0.1);
      case 'Rejected': return const Color(0xFFBA1A1A).withValues(alpha: 0.1);
      default: return Colors.orange.withValues(alpha: 0.1);
    }
  }

  Color _getStatusTextColor(String status) {
    switch (status) {
      case 'Accepted': return const Color(0xFF000000);
      case 'Rejected': return const Color(0xFFBA1A1A);
      default: return Colors.orange.shade800;
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentStatus = widget.participantData['status']?.toString() ?? 'Pending';
    final ticketJobStatus = widget.participantData['ticketJobStatus']?.toString();
    final participantName = _textValue(widget.participantData['name'], fallback: 'Unknown');
    final answerRows = buildParticipantAnswerRows(
      answers: widget.participantData['answers'],
      answerFieldLabels: widget.participantData['answerFieldLabels'],
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
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Column(
                children: [
                  Container(
                    width: 80, height: 80,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceVariant,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.outlineVariant),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      participantName.isNotEmpty ? participantName[0] : '?',
                      style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w600, color: AppColors.secondary),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    participantName,
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600, color: AppColors.onSurface),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: _getStatusBgColor(currentStatus),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: _getStatusBgColor(currentStatus)),
                    ),
                    child: Text(
                      currentStatus,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: _getStatusTextColor(currentStatus)),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),
            const Text(
              'Informasi Dasar',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.onSurface),
            ),
            const SizedBox(height: 16),
            _buildDetailRow('Email', _textValue(widget.participantData['email'])),
            const SizedBox(height: 12),
            _buildDetailRow('Waktu Daftar', _textValue(widget.participantData['createdAt'])),
            const SizedBox(height: 32),
            const Text(
              'Jawaban Form',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.onSurface),
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
                          onPressed: _isProcessing ? null : () => _openParticipantFile(row),
                          icon: Icon(row.isImage ? Icons.image_outlined : Icons.open_in_new, size: 16),
                          label: Text(row.isImage ? 'Lihat foto' : 'Buka/unduh PDF'),
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
                          onPressed: _isProcessing ? null : () => _updateStatus('Rejected'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.error,
                            side: const BorderSide(color: AppColors.error),
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text('Tolak', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _isProcessing ? null : () => _updateStatus('Accepted'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: AppColors.onPrimary,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: _isProcessing
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: AppColors.onPrimary, strokeWidth: 2))
                            : const Text('Setujui', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Status $currentStatus sudah final.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.onSurfaceVariant),
                      ),
                      if (currentStatus == 'Accepted' && (ticketJobStatus == null || ticketJobStatus == 'failed')) ...[
                        const SizedBox(height: 12),
                        OutlinedButton(
                          onPressed: _isProcessing ? null : _retryTicket,
                          child: _isProcessing
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
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
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.onSurfaceVariant)),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontSize: 16, color: AppColors.onSurface)),
      ],
    );
  }

  String _textValue(Object? value, {String fallback = '-'}) {
    if (value == null) return fallback;
    final text = value.toString().trim();
    return text.isEmpty ? fallback : text;
  }
}
