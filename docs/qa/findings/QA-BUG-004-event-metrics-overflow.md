---
type: qa-finding
id: QA-BUG-004
target_phase: Construction
severity: Minor
status: Fixed
---

# QA-BUG-004 — Dashboard metrik mengalami bottom overflow 14 px

**Ditemukan saat:** Testing langsung Sprint 7, Detail Event / Dashboard Metrik  
**Referensi:** S7-T1, S7-T3, FR-ADM-07

## Actual

Pada kartu metrik `Diterima` dan `Sudah Check-in`, Flutter menampilkan `Bottom overflowed
by 14 pixels` dengan persentase `0.0%` pada perangkat mobile.

## Evidence

`mobile/lib/screens/detail_event_metrics_screen.dart:193-230` menggunakan `GridView.count`
dengan `childAspectRatio: 1.1`; kartu progress menambahkan padding, label, progress bar,
dan persentase sehingga tinggi konten dapat melebihi tinggi kartu pada layar target.

## Expected

Tidak ada overflow dan seluruh isi kartu terlihat pada ukuran layar mobile yang didukung.

## Acceptance criteria

- [x] Tidak ada Flutter overflow warning pada data 0%, data normal, dan label panjang.
- [x] Kartu tetap terbaca pada device target.
- [x] Widget test atau screenshot/evidence device tersedia.

## Verification

`Fixed` — menunggu recheck QA; construction tidak memberikan status `Verified`.

## Construction evidence

- Baseline regression pada viewport 320x640 menghasilkan RenderFlex overflow 45–99 px dan horizontal overflow pada header badge.
- After fix: `docker compose exec mobile-admin-build ... flutter test test/detail_event_metrics_screen_test.dart` — pinned Flutter image, service `mobile-admin-build`, exit code 0; data 0%, normal, dan label event panjang pass tanpa exception.
