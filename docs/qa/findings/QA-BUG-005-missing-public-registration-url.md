---
type: qa-finding
id: QA-BUG-005
target_phase: Construction
severity: Major
status: Fixed
---

# QA-BUG-005 — URL pendaftaran peserta tidak tersedia di Kelola Akses

**Ditemukan saat:** Testing langsung Sprint 7, Detail Event → Kelola Akses Panitia  
**Referensi:** UC005, FR-ADM-11, API Get Event Details §11, UI Design §12

## Actual

Section `Akses Pendaftaran Peserta` menampilkan `Belum ada tautan` dan tidak menampilkan
QR pendaftaran. Mobile membaca `publicRegistrationUrl` dan `publicQrCodeUrl`, tetapi
`web/app/api/v1/events/[id]/route.ts:45-55` tidak memasukkan kedua field tersebut ke
response. Fallback mobile berada di `access_management_screen.dart:107`.

## Expected

Setiap event yang berhasil dibuat memiliki URL pendaftaran publik berbasis slug dan QR
yang dapat ditampilkan/disalin dari Kelola Akses. Ini tetap berlaku meskipun Admin belum
menambahkan field kustom, karena Nama dan Email adalah field wajib bawaan.

## Clarification

Event yang tersimpan sebelum form disimpan adalah expected dari flow dua tahap dan bukan
finding terpisah. Finding ini adalah URL/QR yang hilang dari contract dan UI.

## Acceptance criteria

- [x] API detail event mengembalikan URL pendaftaran dan QR sesuai contract.
- [x] URL mengarah ke event publik yang benar berdasarkan slug.
- [x] URL dan QR tampil setelah event dibuat, termasuk form minimal Nama/Email.
- [x] Copy/download dapat digunakan.
- [x] Regression test contract dan evidence Docker tersedia.

## Verification

`Fixed` — menunggu recheck QA; construction tidak memberikan status `Verified`.

## Construction evidence

- Baseline regression: detail event tidak memiliki URL fields (`undefined`).
- After fix: `docker compose exec -e TEST_BASE_URL=http://web-app:3000 web-app ...` — image `node:20-alpine`, service `web-app`, exit code 0; 1/1 test pass.
- Fixture event hanya memiliki event metadata dan default form kosong; slug unik dibuat per test lalu dihapus pada `afterAll`.
- QR response diverifikasi sebagai PNG signature dan URL registration berbasis slug.
