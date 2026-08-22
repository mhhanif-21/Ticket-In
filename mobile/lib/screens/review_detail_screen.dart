import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../services/admin_service.dart';

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

  Color _getStatusBgColor(String status) {
    switch (status) {
      case 'Accepted': return const Color(0xFF41674B).withOpacity(0.1);
      case 'Rejected': return const Color(0xFFBA1A1A).withOpacity(0.1);
      default: return Colors.orange.withOpacity(0.1);
    }
  }

  Color _getStatusTextColor(String status) {
    switch (status) {
      case 'Accepted': return const Color(0xFF41674B);
      case 'Rejected': return const Color(0xFFBA1A1A);
      default: return Colors.orange.shade800;
    }
  }

  @override
  Widget build(BuildContext context) {
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
                      widget.participantData['name']?[0] ?? '?',
                      style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w600, color: AppColors.secondary),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    widget.participantData['name'] ?? 'Unknown',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600, color: AppColors.onSurface),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: _getStatusBgColor(widget.participantData['status'] ?? 'Pending'),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: _getStatusBgColor(widget.participantData['status'] ?? 'Pending')),
                    ),
                    child: Text(
                      widget.participantData['status'] ?? 'Pending',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: _getStatusTextColor(widget.participantData['status'] ?? 'Pending')),
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
            _buildDetailRow('Email', widget.participantData['email'] ?? '-'),
            const SizedBox(height: 12),
            _buildDetailRow('Waktu Daftar', widget.participantData['createdAt'] ?? '-'),
            const SizedBox(height: 32),
            const Text(
              'Jawaban Form',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.onSurface),
            ),
            const SizedBox(height: 16),
            if (widget.participantData['answers'] != null)
              ...((widget.participantData['answers'] as Map<String, dynamic>).entries.map((e) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12.0),
                  child: _buildDetailRow(e.key, e.value.toString()),
                );
              }).toList()),
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
            child: Row(
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
}
