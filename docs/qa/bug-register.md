---
type: qa-bug-register
source: software-qa
scope: Sprint 7 manual exploration
---

# QA Bug Register — Sprint 7

Source of truth untuk finding QA menggunakan lifecycle `Open → In Progress → Fixed → Verified → Won't Fix`.
Artefak legacy tidak dihapus; setiap entry memiliki traceability ke sumber lama bila ada.

| QA ID | Legacy ID | Ringkasan | Severity | Target | Status |
|---|---|---|---|---|---|
| [QA-BUG-001](findings/QA-BUG-001-form-save-payload-contract.md) | — | Form gagal disimpan karena mismatch key JSON mobile/backend | Major | Construction | Fixed |
| [QA-BUG-002](findings/QA-BUG-002-form-save-button-size.md) | — | Tombol Simpan terlalu kecil dan tidak terlihat sebagai tombol | Minor | Construction | Fixed |
| [QA-BUG-003](findings/QA-BUG-003-android-navigation-inset.md) | — | Android system navigation bar memotong UI | Minor | Construction | Fixed |
| [QA-BUG-004](findings/QA-BUG-004-event-metrics-overflow.md) | — | Dashboard metrik bottom overflow 14 px | Minor | Construction | Fixed |
| [QA-BUG-005](findings/QA-BUG-005-missing-public-registration-url.md) | — | URL pendaftaran peserta tidak tersedia di Kelola Akses | Major | Construction | Fixed |
| [QA-BUG-070](findings/QA-BUG-070-legacy-export-api-contract.md) | BUG-070 | Kontrak API export tidak konsisten | Medium* | Construction | Fixed |

`*` Severity legacy dipertahankan. Normalisasi ke skala QA dilakukan saat finding ini direview ulang.

## Excluded observations

- Event tetap tercipta ketika save form gagal: expected dari flow dua tahap saat ini, bukan bug terpisah.
- Label `Review` pada daftar event: berasal dari `registrationMode == 'Manual Review'`, bukan status approval event.

## QA gate note

QA belum menandai finding sebagai `Verified`. Construction harus menyerahkan regression test,
fix, dan evidence Docker/Compose sebelum recheck QA.
