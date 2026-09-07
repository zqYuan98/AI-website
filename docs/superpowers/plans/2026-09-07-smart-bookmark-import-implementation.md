# Smart Bookmark Import Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review the bounded tasks below. User approved the design and implementation; proceed without another design handoff.

**Goal:** Deliver a persistent private bookmark review workspace, conservative deduplication, safe batch import/undo, and owner-configurable AI classification.

**Architecture:** Keep the existing owner authentication, public snapshot and JSON private library. Add private SQL tables for import batches, sources, groups, receipts, model settings and analysis jobs. External analysis runs in small durable Workflow steps; only opaque IDs and control results enter Workflow persistence, while credentials and candidate content stay in the private database/step memory.

**Tech Stack:** Next 16.3.4 App Router, React 19, PostgreSQL/Neon, Node HTTPS/crypto, Workflow SDK, PGlite tests, existing CSS modules.

---

## Task 1: Shared contracts and import domain (backend owner)

Files: `src/lib/smart-import-types.ts`, `src/lib/smart-import-domain.ts`, `src/lib/bookmark-import.ts`, `scripts/check-smart-import.mjs`.

- [x] Add regression assertions for UTM removal without re-encoding, duplicate source retention, invalid rows, same-domain distinct paths and archive/public-only matches. Run with `D:\nodejs\node.exe scripts/check-smart-import.mjs`; verify the new cases fail before implementing.
- [x] Define browser-safe batch/source/group/suggestion/filter/result types. All IDs stable; revisions decimal strings; raw sources distinct from group count.
- [x] Extend safe tokenizer with detailed parsing while preserving existing import API. Limit HTML to 2 MiB and 5000 raw links. Do not store raw HTML.
- [x] Implement conservative canonical and suspected keys, source regrouping, clear rules with reasons, six existing categories/four kinds, manual override precedence and read-only completed groups.
- [x] Run domain and old library checks. Review the diff and commit only owned files.

## Task 2: Persistent batches and transactional import (backend owner)

Files: `migrations/library-002-imports.sql`, `src/lib/server/smart-import-store.ts`, optional focused helpers in `src/lib/server/smart-import-*`, `scripts/check-smart-import-store.mjs`.

- [x] Create additive owner-scoped batch/source/group/receipt tables; revoke PUBLIC access and preserve restricted public reader isolation.
- [x] Export `createSmartImportStore(pool, owner)` and singleton factory. `handle(input, ownerId)` supports list/create/get/decide/edit-source/representative/commit/pause/resume/cancel/delete/undo-preview/undo and explicit existing-record resolution. Root supplies route authentication and body cap.
- [x] Define exact input/output types before UI implementation. Read pages use 50 rows, server filters, include available filter facets and mutually exclusive summary counts; selection uses explicit IDs or reviewed snapshot of filtered IDs, never an expanding live predicate.
- [x] Create hashes recognize unfinished identical uploads. Persist all decisions. Mutations check batchRevision; cross-library commits additionally check libraryRevision. Commit <=100 groups and body cap, stable requestId receipts checked before revision conflicts, lock order state then batch.
- [x] Recheck current library/public snapshot at commit. Preserve existing values, explicit preview for merges/restores; missing formerly matched resources return to review. New resources private, unpinned, unfeatured; organized only after confirmed category.
- [x] Undo preview protects ever-published and edited records; undo uses explicit reviewed IDs/revision. Record existing-resource changes separately.
- [x] Test real SQL transactions with PGlite: owner/ACL, retry, concurrent updates, rollback, stale matches, regroup, ignore restore, undo/publication boundary. Measure 5000 staged and near-limit library commits without printing fixtures.

## Task 3: Custom model configuration and safe transport (API owner)

Files: `src/lib/smart-api-types.ts`, `src/lib/server/smart-api-security.ts`, `src/lib/server/smart-api-client.ts`, `src/lib/server/smart-api-store.ts`, `migrations/library-003-smart-api.sql`, `scripts/check-smart-api.mjs`.

- [x] Define browser-safe settings DTO: name, Base URL, model, enabled, version, tested version, configured key indicator, analysis/request/concurrency/output caps, optional per-million prices and estimated budget. Never expose plaintext or ciphertext.
- [x] Add AES-256-GCM with separate `LIBRARY_API_ENCRYPTION_KEY` (32 random bytes, base64), AAD binding owner/config/version/base URL. Replace/clear key, Base URL changes require new key and test. Reads/backups/logs never include keys.
- [x] Implement public HTTPS validation, no credentials/query/fragment, DNS and fixed socket IP validation, TLS hostname verification, no redirects, strict timeout/response-size caps, sanitized errors. Internal/private addresses and domains excluded from AI candidate payloads.
- [x] Implement OpenAI-compatible Chat Completions using manual model ID and schema validation. Fixed fictional test only, preview destination/path/model, reject invalid category/kind/unknown ID/oversized strings. No webpage fetching or fallback provider.
- [x] Implement owner/revision guarded configuration store with encrypted persistence and version-bound successful test. Saving never sends candidate data.
- [x] Verify encryption/tamper/key binding, SSRF address families/DNS rebinding/redirect, output validation, safe errors and ACL in synthetic transport/PGlite tests.

## Task 4: Owner routes and durable analysis (root)

Files: `src/lib/server/owner-json-api.ts`, `src/app/api/library/imports/route.ts`, `src/app/api/library/smart-settings/route.ts`, `src/app/api/library/analysis/route.ts`, `src/lib/server/smart-analysis-store.ts`, `src/workflows/smart-analysis.ts`, `migrations/library-004-analysis.sql`, `next.config.ts`, `package.json`, `bun.lock`, `scripts/check-smart-analysis.mjs`, `scripts/check-smart-routes.mjs`.

- [x] Reuse exact canonical Origin/owner/no-store/body-stream guards in a focused helper; test anonymous, wrong Origin, disabled mode, oversized body and invalid JSON. Existing library API behavior remains compatible.
- [x] Install stable Workflow SDK and read its bundled Next/start/retry docs. Only job IDs passed to workflow/step; secret-bearing processing remains inside a step returning control counts, never credentials/bookmarks.
- [x] Analysis preview uses selected eligible group title + public domain, allows exclusion, shows target/model/count/limits/cost unknown or estimate. Start binds immutable config version and candidate revision/scope to job receipt.
- [x] Persistent jobs reserve request/output/input and estimated money budgets atomically; small groups, bounded concurrency, claims with leases. Do not hold SQL locks across network requests. Manual decisions win over late output.
- [x] Pause/cancel/disabled config stops unsent work. Config changes pause version-bound jobs, requiring fresh preview/confirmation to send under new config. Ambiguous timeout/crash stops automatic charged retries, retains progress and marks possible charge. Workflow dispatch failure leaves recoverable job with explicit retry.
- [x] Test mocked responses and worker interruption/idempotence/config changes/unknown billing/budget races. Do not call external models using real bookmarks during development.

## Task 5: Review workspace and settings UI (UI owner)

Files: `src/components/resources/smart-import-*.tsx`, `src/components/resources/smart-import.module.css`, `src/components/resources/smart-settings.tsx`, `src/components/resources/smart-api.ts`, `src/components/resources/manager-workspace.tsx`, `src/app/tools/manage/imports/page.tsx`, `src/app/tools/manage/imports/[batchId]/page.tsx`, `src/app/tools/manage/settings/page.tsx`.

- [x] Follow frontend-design skill within the approved navy/blue/white visual system. Primary text/actions 16px, secondary 14px; reuse modal/focus and accessible controls.
- [x] Cloud import entry opens persistent batch list/upload; local mode retains existing local importer. Add settings and batch-filtered return-to-library navigation.
- [x] Implement summary, 50-row pagination, folder/domain/type/category/views, explicit page/all-filtered selection, bulk suggestion/category/keep/defer/ignore/import, status/progress and errors preserving decisions.
- [x] Details supports source representative/exclusion/edit/recheck and existing comparisons; imported groups read-only. Batch actions/undo preview/report export use backend contracts.
- [x] Settings has key replacement/clear, destination/test confirmation with fictional sample, caps and privacy notice. Analysis preview shows exact selected titles/domains and exclusions before start; show persisted progress and retry semantics.
- [x] Verify desktop and 390px mobile with isolated fixtures: upload/reopen, filters/selection,1000+ rows pagination, duplicate and conflict flows, key masking and no browser storage, keyboard/focus/error states. Save screenshots/report under `docs/reports/`.

## Task 6: Integration, review and deployment (root with reviewers)

Files: `scripts/check-quality.mjs`, `scripts/cloud-library.mjs`, `.env.example` or existing cloud documentation, spec/plan/report.

- [x] Wire new checks into existing quality gate and ordered additive migrations into explicit migration CLI; existing backups exclude settings/import state.
- [x] Run `D:\nodejs\node.exe scripts/check-quality.mjs --build`. Fix actual failures, then independent spec and security/quality reviews. No unrelated file staging.
- [x] Verify offline/failed API does not block manual private import; verify public projection and ordinary unauthenticated pages remain unchanged.
- [x] Configure an independent random production encryption key securely through already-authorized Vercel CLI without output. Apply additive migrations with existing production connection after local SQL/ACL validation, no destructive account/resource changes.
- [ ] Deploy the reviewed commit via existing Git/Vercel process and check production anonymous access/privacy, login redirect, page availability and deployment status. No real private-resource changes or external AI calls in smoke checks.
- [ ] Update docs to implemented status with measured limits and honest verification gaps; report owner settings path and that the user's API key can be entered there.

## Execution notes

The existing dedicated `codex/smart-bookmark-import-design` branch has a clean tracked baseline and established local runtime; keep this checkout to preserve the current authorized setup. Parallel workers have disjoint file ownership and shared contracts. The root integrates dependencies/routes/deployment; reviewers are read-only. This avoids an unnecessary second checkout and secret-file copies.

Source design: `docs/superpowers/specs/2026-09-07-smart-bookmark-import-design.md` (approved by user). Workflow platform sources checked 2026-09-07: https://vercel.com/docs/workflows and https://vercel.com/docs/workflows/pricing. No plan upgrade or paid marketplace installation is part of this work.

Implementation and local acceptance completed 2026-09-08. Full quality gate and production build passed. Production encryption key and additive migrations configured; release smoke verification pending. Actual measured coverage and untested real-provider boundary are recorded in docs/reports/2026-09-08-smart-import-verification.md. Root stages and commits all owned changes together after review; agents did not create separate commits.
