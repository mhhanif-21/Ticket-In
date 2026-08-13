---
type: construction-decision-record
artifact: sprint-7-qa-bug-fix
---

# Construction Decision Record — Sprint 7 QA Bug Fix

## CDR-001: Canonical payload form builder

**Tanggal:** 2026-08-13  
**Finding:** QA-BUG-001  
**Kategori:** API contract  
**Status:** Decided

**Konteks:** Flutter mengirim `field_name`, `field_type`, dan `is_required`, sedangkan
backend membaca `fieldName`, `fieldType`, dan `isRequired`.

| Opsi | Pro | Con |
|---|---|---|
| `snake_case` canonical | Sama dengan payload aktual Flutter dan API design | Backend perlu normalisasi boundary |
| `camelCase` canonical | Selaras dengan interface backend saat ini | Mengubah payload Flutter dan API design |
| Menerima dua format | Kompatibilitas sementara | Contract tetap ambigu dan drift dapat berulang |

**Rekomendasi Agent:** `snake_case` canonical dengan mapping internal backend.  
**Keputusan User:** Disetujui melalui approval execution plan.

## CDR-002: Canonical export contract

**Tanggal:** 2026-08-13  
**Finding:** QA-BUG-070  
**Kategori:** API contract  
**Status:** Decided

**Keputusan:** Pertahankan `POST /api/v1/events/{id}/export` asynchronous dengan response
`data.job_id`, kemudian polling `GET /api/v1/exports/{job_id}` sampai `file_url` tersedia.
GET `/api/v1/events/{id}/export` tidak ditambahkan sebagai alias.

**Alasan:** Export membuat job dan asynchronous flow mengurangi risiko timeout Vercel.
API design §14 akan diperbarui secara eksplisit; legacy BUG-070 tidak dihapus atau diganti.

**Keputusan User:** Disetujui melalui approval execution plan.

## CDR-003: Public registration and QR contract

**Tanggal:** 2026-08-13  
**Finding:** QA-BUG-005  
**Kategori:** API/UI contract  
**Status:** Decided

**Keputusan:** `public_registration_url` menggunakan `/{slug}/register`. QR publik disediakan
melalui endpoint internal yang menghasilkan QR dari URL tersebut menggunakan dependency
`qrcode` yang sudah ada, tanpa dependency eksternal atau bucket baru.

**Alasan:** URL langsung membuka flow pendaftaran, slug tetap menjadi sumber identitas event,
dan endpoint internal menghasilkan URL HTTP yang dapat ditampilkan serta diunduh Flutter.

**Keputusan User:** Disetujui melalui approval execution plan.
