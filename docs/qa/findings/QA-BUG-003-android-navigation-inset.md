---
type: qa-finding
id: QA-BUG-003
target_phase: Construction
severity: Minor
status: Fixed
---

# QA-BUG-003 — Android system navigation bar memotong UI

**Ditemukan saat:** Testing langsung Sprint 7 pada perangkat Android dengan three-button navigation  
**Referensi:** S7-T3, NFR-USAB-01

## Actual

Navigation bar Android yang berisi tombol Back, Home, dan Recent Apps tampil sebagai area
hitam transparan di bawah layar dan memotong tombol/konten aplikasi.

## Expected

Konten dan tombol aplikasi menghormati system window insets melalui `SafeArea`/padding
yang sesuai dan tidak berada di bawah navigation bar.

## Evidence / scope

Beberapa screen memakai `bottomSheet` atau bottom action tanpa `SafeArea`, termasuk flow
create event. Root cause final perlu dikonfirmasi pada device/configuration yang digunakan.

## Acceptance criteria

- [x] Tidak ada clipping pada simulasi Android three-button navigation dengan bottom inset.
- [x] Bottom action, FAB, dan scroll content tetap dapat diakses.
- [ ] Recheck physical device/emulator pada mode gesture navigation dan three-button navigation (QA).

## Verification

`Fixed` — widget/inset construction check pass; device QA recheck tetap diperlukan dan status belum `Verified`.

## Construction evidence

- Regression baseline ditulis sebelum fix; bottom action create/edit tidak memiliki SafeArea ancestor yang ditargetkan.
- After fix: `docker compose exec mobile-admin-build ... flutter test test/android_navigation_inset_test.dart` — pinned Flutter image, service `mobile-admin-build`, exit code 0; skenario create dan edit pass dengan simulated bottom padding 48 px.
- Android three-button dan gesture navigation direpresentasikan melalui bottom inset 48 px dan zero inset pada Flutter widget environment. Physical device/emulator screenshot remains QA recheck evidence.
