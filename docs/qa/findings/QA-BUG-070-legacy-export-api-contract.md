---
type: qa-finding-import
id: QA-BUG-070
legacy_id: BUG-070
target_phase: Construction
severity: Medium
status: Fixed
legacy_source: ../../bug-reports/BUG-070-s7-t2-export-api-contract.md
ucn: ../../../upstream-change-notes/UCN-QA-CON-070-export-api-contract.md
---

# QA-BUG-070 — Imported legacy finding

Finding ini diimpor ke registry QA canonical tanpa menghapus atau mengubah ticket legacy.
Detail evidence, root cause, acceptance criteria, dan UCN tetap berada pada:

- Legacy ticket: `docs/bug-reports/BUG-070-s7-t2-export-api-contract.md`
- Corrective action: `upstream-change-notes/UCN-QA-CON-070-export-api-contract.md`

## Construction resolution

Canonical contract diputuskan sebagai asynchronous `POST /api/v1/events/{id}/export`
dengan response `data.job_id`, dilanjutkan polling `GET /api/v1/exports/{job_id}` sampai
`data.file_url` tersedia. GET `/api/v1/events/{id}/export` tidak ditambahkan sebagai alias.
Legacy artifact tetap dipertahankan.

Status: `Fixed` — menunggu recheck QA; construction tidak memberikan status `Verified`.

## Construction evidence

- Baseline contract test gagal karena API design masih mendokumentasikan GET + synchronous file/URL.
- After fix: `docker compose run --rm --no-deps -e API_DESIGN_PATH=/workspace/docs/design/api-design.md -v "$PWD:/workspace:ro" web-app ...` — image `node:20-alpine`, service `web-app`, exit code 0; 2/2 contract tests pass.
- Existing `s7_t2_export.test.ts`: same `web-app` service with isolated event/registration fixtures and non-secret QStash test keys, exit code 0; 3/3 tests pass.
