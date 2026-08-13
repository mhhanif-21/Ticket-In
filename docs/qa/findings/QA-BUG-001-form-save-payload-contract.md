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

- `mobile/lib/models/event_model.dart:26-33` mengirim key `field_name`, `field_type`,
  `is_required`, `options`, `order`.
- `web/lib/actions/SaveCustomFormAction.ts:7-12` mendefinisikan payload dengan key
  `fieldName`, `fieldType`, `isRequired`.
- `web/lib/actions/SaveCustomFormAction.ts:29` membaca `field.fieldType`; key snake_case
  dari mobile tidak dipetakan sehingga nilainya `undefined` dan ditolak.

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

## Verification

`Fixed` — menunggu recheck QA; construction tidak memberikan status `Verified`.

## Construction evidence

- Regression baseline: `docker compose exec web-app ... npx vitest run tests/integration/s7_bug001_form-save-payload-contract.test.ts` — exit code 1; gagal dengan `Tipe field tidak diizinkan: undefined`.
- Regression after fix: `docker compose exec -e TEST_BASE_URL=http://web-app:3000 web-app ...` — image `node:20-alpine`, service `web-app`, exit code 0; 1/1 test pass.
- Fixture event dibuat dengan slug unik berbasis timestamp dan dihapus pada `afterAll`; tidak memakai secret.
