import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class ManualBookScreen extends StatelessWidget {
  const ManualBookScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceContainerLowest,
        foregroundColor: AppColors.onSurface,
        elevation: 0,
        title: const Text(
          'Manual Book Admin',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: const [
          _ManualIntro(),
          SizedBox(height: 16),
          _ManualSection(
            icon: Icons.login,
            title: '1. Masuk ke Aplikasi',
            body:
                'Gunakan email dan password admin yang diberikan panitia. '
                'Akun admin hanya bisa dibuka jika emailnya terdaftar sebagai admin '
                'di sistem. Jika muncul "Invalid credentials", periksa kembali email/password '
                'atau hubungi tim teknis untuk didaftarkan.',
          ),
          _ManualSection(
            icon: Icons.add_box_outlined,
            title: '2. Membuat Event',
            body:
                'Dari halaman Event, tekan tombol + untuk membuat event baru. Isi nama event, '
                'tanggal, waktu, lokasi, dan poster. Setelah detail tersimpan, lanjutkan mengisi '
                'form pendaftaran dan pengaturan tiket.',
          ),
          _ManualSection(
            icon: Icons.dynamic_form_outlined,
            title: '3. Form Pendaftaran',
            body:
                'Atur field yang harus diisi peserta (nama, email, instansi, dll). '
                'Nama dan email wajib untuk pengiriman tiket. Field lain bebas disesuaikan '
                'dengan kebutuhan event.',
          ),
          _ManualSection(
            icon: Icons.tune,
            title: '4. Mode Pendaftaran',
            body:
                'Auto-Accept: peserta langsung diterima dan tiket diproses otomatis. '
                'Manual Review: peserta masuk daftar tunggu untuk disetujui/ditolak admin. '
                'Pilih Manual Review jika ingin menyeleksi peserta.',
          ),
          _ManualSection(
            icon: Icons.verified_user_outlined,
            title: '5. Verifikasi OTP',
            body:
                'Pada mode Manual Review, peserta menerima kode OTP lewat email yang berlaku '
                '10 menit. Peserta wajib memasukkannya untuk menyelesaikan pendaftaran. '
                'Jika melewati batas waktu, status pendaftaran menjadi "Expired" dan tidak '
                'menghitung kuota. Peserta bisa daftar ulang.',
          ),
          _ManualSection(
            icon: Icons.fact_check_outlined,
            title: '6. Review Peserta',
            body:
                'Buka daftar peserta, lalu ketuk peserta berstatus Pending untuk melihat detail '
                'jawaban. Tekan Approve untuk menerima atau Reject untuk menolak. '
                'Setelah Approve, sistem membuat tiket dan mengirimkannya via email.',
          ),
          _ManualSection(
            icon: Icons.qr_code_2,
            title: '7. Tiket & QR Code',
            body:
                'Tiket berisi QR dan kode tiket dalam satu gambar. Untuk cadangan jika email '
                'tidak terkirim, peserta berstatus Accepted memiliki tombol unduh di daftar '
                'peserta. Gambar tiket akan diunduh ke perangkat admin.',
          ),
          _ManualSection(
            icon: Icons.forum_outlined,
            title: '8. Grup WhatsApp',
            body:
                'Isi tautan grup WhatsApp pada pengaturan event. Tautan ini ikut dikirim pada '
                'email verifikasi OTP dan tampil di halaman status peserta setelah OTP terverifikasi, '
                'sehingga peserta bisa langsung bergabung.',
          ),
          _ManualSection(
            icon: Icons.mail_outline,
            title: '9. Template Email & Tiket',
            body:
                'Template email bawaan sudah mengikuti tema Engineering Career Expo. '
                'Admin dapat menyesuaikan template per event dari menu pengaturan tiket, '
                'termasuk mengunggah background tiket khusus bila diperlukan.',
          ),
          _ManualSection(
            icon: Icons.qr_code_scanner,
            title: '10. Access Management & Scanner',
            body:
                'Gunakan menu Access Management untuk melihat QR pendaftaran event dan PIN '
                'scanner petugas. Bagikan QR pendaftaran ke calon peserta dan PIN ke petugas '
                'pintu untuk memindai tiket saat registrasi ulang di lokasi.',
          ),
          _ManualSection(
            icon: Icons.file_download_outlined,
            title: '11. Export Data Peserta',
            body:
                'Di halaman peserta, gunakan tombol Export untuk mengunduh data peserta dalam '
                'format CSV. File akan diproses lalu diunduh otomatis lewat browser.',
          ),
          _ManualSection(
            icon: Icons.help_outline,
            title: '12. Status Peserta',
            body:
                'Draft: belum verifikasi OTP. Pending: menunggu review admin. '
                'Accepted: diterima dan tiket diterbitkan. Rejected: ditolak admin. '
                'Expired: OTP kedaluwarsa sebelum diselesaikan. Absen/kehadiran dicatat '
                'oleh petugas scanner di lokasi acara.',
          ),
        ],
      ),
    );
  }
}

class _ManualIntro extends StatelessWidget {
  const _ManualIntro();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.menu_book_outlined, size: 32, color: AppColors.primary),
          SizedBox(height: 12),
          Text(
            'Panduan Admin Ticket-In',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Buku panduan singkat penggunaan aplikasi admin untuk mengelola event, '
            'review peserta, tiket, dan akses masuk acara. Ketuk tiap bagian untuk '
            'melihat penjelasan.',
            style: TextStyle(
              fontSize: 13,
              height: 1.6,
              color: AppColors.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _ManualSection extends StatelessWidget {
  const _ManualSection({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        iconColor: AppColors.primary,
        collapsedIconColor: AppColors.secondary,
        leading: Icon(icon, color: AppColors.primary),
        title: Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.onSurface,
          ),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            body,
            style: const TextStyle(
              fontSize: 13,
              height: 1.6,
              color: AppColors.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
