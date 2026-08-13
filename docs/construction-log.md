### Sprint 5 - Task 1: Admin Participant Review
- **Status:** Completed
- **Changes:**
  - Implemented `GET /api/v1/events/[id]/registrations` for retrieving and filtering registrations. Mutually exclusive filters are strictly enforced (HTTP 400).
  - Implemented `POST /api/v1/registrations/[id]/review` for admin to accept/reject registrations.
  - Hooked QStash publisher to trigger ticket generation (S5-T3) automatically upon approval.
  - Fixed database schema migrations to include full definitions.
  - Successfully ran integration tests using Vitest (S5-T1).


### Sprint 5 - Task 2: QStash Webhook Endpoint
- **Status:** Completed
- **Changes:**
  - Created stub logic for GenerateTicketAction in lib/actions/ticket.ts with idempotency check placeholder.
  - Implemented POST /api/v1/worker/process-ticket route to handle QStash requests.
  - Added signature verification logic using @upstash/qstash Receiver.
  - Returns 500 automatically when errors are caught (facilitating EHR-001 QStash retry).
  - Ensured Node.js runtime is strictly used.
  - Validated tests (S5-T2) for multiple conditions (no signature, missing ID, correct flow, error simulation).

| Task ID | Task Name | Status | Description |
| :--- | :--- | :--- | :--- |
| S5-T2 | QStash Webhook Endpoint | Done | Idempotent endpoint, QStash signature verification, and handles generating ticket securely. |
| S5-T3 | Generate Ticket Action | Done | Code Generation, Idempotency, QR code generation, Supabase Storage integration, Unique collisions retry. |
| S5-T4 | Email Ticket Delivery | Done | Send email using Brevo wrapper, only for 'Manual Review' events. Enforce 3s timeout. |

### Sprint 5 - Task 4: Email Ticket Delivery
- **Status:** Completed
- **Changes:**
  - Implemented `triggerTicketEmailDelivery` within `web/lib/actions/ticket.ts` to send the ticket email via Brevo.
  - Added conditional check: only send email if `event.registrationMode === 'Manual Review'`.
  - Kept strictly to the `sendEmail` Brevo wrapper which enforces the 3-second hard timeout using `AbortController` (EHR-002).
  - Designed tests in `tests/integration/s5_t4_email_ticket.test.ts` to mock `fetch`, simulate the 3-second timeout, and verify skip conditions for 'Auto-Accept'.

### Sprint 6 - Task 1: Check-in Session Entry
- **Status:** Completed
- **Changes:**
  - Applied TDD approach by writing `tests/integration/s6_t1_session.test.ts` first.
  - Updated `app/api/v1/auth/volunteer/login/route.ts` to insert a record into `checkInSessions` table upon successful PIN verification.
  - Included `session_id` inside the signed JWT payload.
  - Modified `middleware.ts` to extract `session_id` from the volunteer token and append it to the internal `x-session-id` header.
  - Created `app/[event_slug]/checkin/page.tsx` with a premium, mobile-friendly UI using Lucide icons and gradient styling, which stores the token in both `localStorage` and `cookie`, before redirecting to the scanner UI.
### Sprint 6 - Task 2: QR Ticket Scan & Validation
- **Status:** Completed
- **Changes:**
  - Designed and developed `POST /api/v1/checkin/scan` with `db.transaction` for reliable and atomic checks (preventing double check-ins).
  - Validation ensures the ticket exists, matches the event, and is `Accepted`. Invalid tickets yield HTTP 400 with an `Invalid` log.
  - Implemented strict presence checks. Duplicate scans yield HTTP 409 along with the `first_scan_time` and append a `Duplicate` log for auditing.
  - Successful scans mutate the ticket status to `Present`, emit a `Success` log, and return 200 OK.
  - Verified logic using the integration test suite `s6_t2_scan.test.ts` (Red-Green-Refactor).

### Sprint 6 - Task 3: Manual Ticket Code Input (Fallback)
- **Status:** Completed
- **Changes:**
  - Applied TDD by writing `s6_t3_manual.test.ts` to ensure input strings with trailing spaces and lowercasing are gracefully normalized.
  - Re-used `POST /api/v1/checkin/scan` endpoint by adding `trim().toUpperCase()` logic to the incoming `ticket_code`, preventing duplicative controller logic.
  - Designed `app/[event_slug]/checkin/manual/page.tsx` as a fallback Client Component. Features an auto-capitalizing max-8-char input, dynamic toast alerts handling Success, Duplicate, and Invalid scenarios.
  - Implemented auto-dismiss timers on scan results to prepare the field for rapid re-entry.

### Sprint 6 - Task 4: Web Scanner UI
- **Status:** Completed
- **Changes:**
  - Installed `html5-qrcode` to handle robust Client-Side WebRTC camera scanning.
  - Built `app/[event_slug]/checkin/scan/page.tsx` React component with premium responsive UI.
  - Implemented Theme Toggle (Dark/Light) with persistence in `localStorage`.
  - Implemented Camera Flip (Front/Back) via `facingMode` toggle state.
  - Created Auto-Dismiss logic: upon successful scan, the scanner pauses, shoots the API, shows a beautiful absolute-positioned Toast based on response status, then vanishes and automatically resumes the camera after 3 seconds.

### Sprint 6 - Additional Task 1: Comprehensive E2E Testing & DB Connection Fix
- **Status:** Completed
- **Changes:**
  - Wrote and executed `scripts/test_sprint6_api.sh` performing brutal cURL testing to all scanner endpoints to capture integration bugs missed by unit tests.
  - Identified `ECONNRESET` PostgreSQL pool exhaustion caused by Next.js Hot Module Replacement (HMR).
  - Fixed database instantiation by implementing a global singleton pattern in `db/index.ts`, ensuring resilient API responses across multiple concurrent requests.

### Sprint 6 - Additional Task 2: UI Overhaul & Stitch Design Compliance
- **Status:** Completed
- **Changes:**
  - Radically overhauled the Volunteer Login and Scanner UIs to mirror the provided *Stitch Design System* (pixel-perfect accuracy).
  - Injected CSS variable tokens like `surface-container-lowest` into Tailwind v4 `@theme inline` via `globals.css`.
  - Imported Google Fonts (`Fraunces` and `Inter`) at root layout and mapped them to CSS custom properties.
  - Migrated the manual input box directly into the camera scanner page as a unified component, eliminating the need for a separate fallback page.

### Sprint 6 - Bug Fixes: React 18 Strict Mode & HTML5-QRCode Polish
- **Status:** Completed
- **Changes:**
  - **Transition Lock**: Fixed the `Cannot transition to a new state` error by refactoring `isProcessing` state into an `isProcessingRef` and adding `isTransitioningRef` locking to prevent React re-renders from spawning concurrent `.start()` and `.stop()` commands to the camera.
  - **DOM Unmounting**: Resolved `TypeError: Cannot read properties of null (reading 'clientWidth')` by ensuring the `#qr-reader` `<div>` remains persistently mounted and is only hidden via CSS, rather than detached from the DOM during camera unavailability.
  - **Graceful Permissions**: Silenced the Next.js *dev error overlay* for `Permission denied` (`NotAllowedError`) by catching the exception explicitly and removing raw `console.error` calls. Created a beautifully integrated gray fallback overlay commanding users to "Allow Camera" manually instead of breaking the app.
  - **Pure Dark Mode Inversions**: Adjusted the dark mode toggles, footer background, and buttons to be purely black-and-white inverted based on user request (e.g. moving the toggle to the header with a minimalist Sun/Moon icon, and removing gray backgrounds).

### Preview Environment - Supabase Storage Bucket Alignment
- **Status:** Fixed
- **Rationale:** Runtime code and historical Storage migrations used inconsistent bucket names.
- **Canonical buckets:** `event_posters` (public, 5 MiB), `participant_files` (private, 1 MiB), and `tickets` (public, 5 MiB).
- **Changes:** Added an additive Storage migration, shared bucket constants, updated poster/registration/ticket runtime references, and aligned the setup helper.
- **Regression test:** `tests/unit/storage-buckets-contract.test.ts` — 1 test passed.
- **Docker evidence:** `docker compose run --rm --no-deps web-app sh -c 'npm install && npx vitest run tests/unit/storage-buckets-contract.test.ts'` — exit code 0; TypeScript project check — exit code 0; scoped ESLint — exit code 0.
- **Preview migration evidence:** `docker compose run --rm --no-deps -v "$PWD/supabase:/workspace/supabase:ro" -w /workspace web-app sh -c 'npx supabase db push --workdir /workspace --db-url "$DATABASE_URL" --yes'` — image/service `web-app` / `node:20-alpine`, exit code 0. Supabase migration history contains `20260720000000`, `20260721000000`, and `20260813000000`; read-only verification confirmed all three canonical buckets and the public poster read policy.
- **Open note:** Legacy buckets from earlier migrations remain for history compatibility and are not referenced by runtime code.

### Sprint 7 QA Findings — Construction Pass 1 and Pass 2
- **Tanggal:** 2026-08-13
- **Pass 1:** QA-BUG-001, QA-BUG-005, QA-BUG-070 — Fixed.
- **Pass 2:** QA-BUG-002, QA-BUG-003, QA-BUG-004 — Fixed.
- **Pass 1 commit message:** `fix(s7): align form, registration, and export contracts (QA-BUG-001 QA-BUG-005 QA-BUG-070)`.
- **Pass 2 commit message:** `fix(s7): harden mobile actions, insets, and metrics layout (QA-BUG-002 QA-BUG-003 QA-BUG-004)`.
- **Contract decisions:** `snake_case` canonical untuk form payload; asynchronous `POST` + `job_id` canonical untuk export; public registration URL `/{slug}/register` dan QR endpoint internal berbasis slug.
- **Root causes:** payload mobile/backend tidak dinormalisasi; event detail tidak memproyeksikan URL publik; API design export drift dari implementasi async; bottom actions tidak memakai SafeArea; metrics grid memakai sizing yang terlalu pendek untuk isi kartu.

**Regression evidence dan Docker proof:**

| Scope | Command | Image/service | Exit code | Result |
|---|---|---|---:|---|
| Pass 1 form + URL + existing export | `docker compose exec -e TEST_BASE_URL=http://web-app:3000 web-app sh -c 'npx vitest run tests/integration/s7_bug001_form-save-payload-contract.test.ts tests/integration/s7_bug005_public-registration-url.test.ts tests/integration/s7_t2_export.test.ts'` | `node:20-alpine` / `web-app` | 0 | 5/5 tests pass |
| Pass 1 export contract | `docker compose run --rm --no-deps -e API_DESIGN_PATH=/workspace/docs/design/api-design.md -v "$PWD:/workspace:ro" web-app sh -c 'npx vitest run tests/integration/s7_bug070_export-contract.test.ts'` | `node:20-alpine` / one-shot `web-app` | 0 | 2/2 tests pass |
| Pass 2 UI regression | `docker compose exec mobile-admin-build sh -c 'flutter test test/form_builder_screen_test.dart test/android_navigation_inset_test.dart test/detail_event_metrics_screen_test.dart'` | pinned `ghcr.io/cirruslabs/flutter@sha256:217a3d81...` / `mobile-admin-build` | 0 | 6/6 tests pass |
| Flutter full suite | `docker compose exec mobile-admin-build sh -c 'flutter test'` | pinned Flutter image / `mobile-admin-build` | 0 | 25 tests pass |
| Flutter contract tests | `docker compose exec mobile-admin-build sh -c 'flutter test test/event_model_test.dart test/form_builder_screen_test.dart test/export_contract_test.dart'` | pinned Flutter image / `mobile-admin-build` | 0 | 6 tests pass |
| Android debug build | `docker compose run --rm mobile-admin-build sh -c 'flutter build apk --debug; code=$?; echo APK_BUILD_EXIT_CODE=$code; exit $code'` | pinned Flutter image / one-shot `mobile-admin-build` | 0 | `build/app/outputs/flutter-apk/app-debug.apk` built |
| Web typecheck | `docker compose exec web-app sh -c 'npx tsc --noEmit --pretty false'` | `node:20-alpine` / `web-app` | 0 | pass |
| Flutter analyzer | `docker compose exec mobile-admin-build sh -c 'flutter analyze --no-fatal-infos'` | pinned Flutter image / `mobile-admin-build` | 0 | pass; 47 existing info/deprecation notices |

All test fixtures use unique timestamp slugs and cleanup hooks. No host application tooling
was used, no package was installed on the host, and no secret was printed or committed.

**Open QA handoff:** QA must recheck physical Android three-button and gesture navigation,
then may transition findings from `Fixed` to `Verified`. Construction intentionally does not
set `Verified`.

### Construction Decision Registry — Sprint 7 QA

| ID | Decision | Impact |
|---|---|---|
| CDR-001 | Form payload canonical `snake_case` | Flutter payload and backend boundary aligned |
| CDR-002 | Export canonical asynchronous POST + `job_id` | API design, backend, client, and tests aligned |
| CDR-003 | Registration URL `/{slug}/register`; QR endpoint internal | Minimal events expose stable public access |
