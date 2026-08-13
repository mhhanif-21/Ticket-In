---
type: qa-finding
id: QA-BUG-001
legacy_id: null
target_phase: Construction
severity: Major
status: Fixed
---

# QA-BUG-001 — Form pendaftaran gagal disimpan karena mismatch payload

**Ditemukan saat:** Testing langsung Sprint 7, halaman Susun Form Pendaftaran  
**Referensi:** S3-T2, UC002, FR-ADM-02, API `POST /api/v1/events/{id}/fields`

## Actual

Admin menghapus seluruh field kustom sehingga tersisa field wajib `Nama` dan `Email`,
namun menekan `Simpan` tetap menghasilkan error field tidak diizinkan.

## Expected

Form minimal dengan field wajib Nama dan Email harus dapat disimpan. Field kustom yang
dipilih dari UI juga harus diterima.

## Evidence / root cause

- `FormBuilderScreen._saveFields()` meneruskan `FormFieldModel` ke
  `EventService.saveFormFields()`.
- `EventService` mengirim `fields.map((field) => field.toJson())` ke
  `POST /api/v1/events/{id}/fields` melalui `ApiClient`.
- `FormFieldModel.toJson()` dan boundary backend menggunakan contract canonical
  `field_name`, `field_type`, `is_required`, `options`, `order`.

Root cause sementara: kontrak serialisasi JSON mobile/backend tidak sama.

## Reproduction

1. Buat event.
2. Buka Susun Form Pendaftaran.
3. Jangan tambahkan field kustom; sisakan Nama dan Email.
4. Tekan Simpan.
5. Actual: request gagal dengan pesan tipe/field tidak diizinkan.

## Acceptance criteria construction

- [x] Mobile dan backend memakai satu nama key JSON canonical.
- [x] Save berhasil dengan hanya Nama dan Email.
- [x] Save berhasil untuk seluruh tipe field yang tersedia di UI.
- [x] Regression test memakai payload aktual dari mobile dan gagal pada baseline.
- [x] Evidence Docker/Compose dan construction log tersedia.
- [x] HTTP integration test melewati route `POST /api/v1/events/{id}/fields`.
- [x] APK rebuild memakai `API_BASE_URL=http://10.0.2.2:3000/api`.

## Verification

`Fixed` — runtime `web-app` di-force-recreate dari source terbaru dan HTTP route test menerima
payload snake_case lengkap tanpa `undefined`. APK debug juga dibangun dari source terbaru dengan
API base URL emulator Android yang eksplisit. Construction tidak memberikan status `Verified`.

## Construction evidence

- Regression baseline: `docker compose exec web-app ... npx vitest run tests/integration/s7_bug001_form-save-payload-contract.test.ts` — exit code 1; gagal dengan `Tipe field tidak diizinkan: undefined`.
- Regression after fix: `docker compose exec -T -e TEST_BASE_URL=http://web-app:3000 web-app sh -c 'npx vitest run tests/integration/s7_bug001_form-save-payload-contract.test.ts'` — image `node:20-alpine`, service `web-app` hasil `--force-recreate`, exit code 0; 1/1 test pass melalui HTTP route.
- Flutter trace: `flutter test test/form_builder_screen_test.dart test/event_service_contract_test.dart` — pinned Flutter image, exit code 0; runtime field map sampai ApiClient mempertahankan `field_type`.
- APK: `flutter build apk --debug --dart-define=API_BASE_URL=http://10.0.2.2:3000/api` — pinned Flutter image, exit code 0; artifact tersimpan sebagai `Ticket-In-debug-qa-recheck.apk`.
- Fixture event dibuat dengan slug unik berbasis timestamp dan dihapus pada `afterAll`; tidak memakai secret.

## Corrective construction evidence

- Baseline corrective widget test gagal karena tombol masih berada di `AppBar` dan bottom
  action Form Builder belum tersedia.
- HTTP request aktual diuji melalui route protected dengan fixture admin dan event terisolasi;
  tidak ada secret yang dicetak.
