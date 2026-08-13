---
type: qa-finding
id: QA-BUG-002
target_phase: Construction
severity: Minor
status: Fixed
---

# QA-BUG-002 — Tombol Simpan pada Susun Form terlalu kecil

**Ditemukan saat:** Testing langsung Sprint 7, halaman Susun Form Pendaftaran  
**Referensi:** S3-T2, UC002

## Actual

Kontrol Simpan di AppBar saat ini berupa `TextButton` dengan font 12 px tanpa container
atau ukuran tap target yang jelas (`mobile/lib/screens/form_builder_screen.dart:377-385`).
Di perangkat mobile tampil seperti teks kecil, bukan tombol aksi utama.

## Expected

Simpan tampil sebagai tombol yang jelas, mudah ditemukan, dan memiliki tap target mobile
yang memadai.

## Acceptance criteria

- [x] Visual button jelas dan konsisten dengan primary action.
- [x] Tap target tidak terpotong system navigation/inset.
- [x] State disabled/loading tetap terlihat saat proses save.
- [x] Widget test/regression evidence tersedia.

## Verification

`Fixed` — menunggu recheck QA; construction tidak memberikan status `Verified`.

## Construction evidence

- Baseline regression ditulis sebelum fix; baseline gagal compile karena `FormBuilderScreen` belum memiliki injection seam dan belum menyediakan primary `ElevatedButton`.
- After fix: `docker compose exec mobile-admin-build ... flutter test test/form_builder_screen_test.dart` — pinned Flutter image `ghcr.io/cirruslabs/flutter@sha256:217a3d81...`, service `mobile-admin-build`, exit code 0; tap target terukur minimal 48 px.
