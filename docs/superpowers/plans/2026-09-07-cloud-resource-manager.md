# Cloud Resource Manager Implementation Plan

> **For agentic workers:** Use subagent-driven development with independent auth, storage, and UI ownership. Root integrates and verifies the full flow.

**Goal:** Open the existing resource manager online to one password-authenticated owner, with private cloud storage and explicit publication.

**Architecture:** Keep Next.js on Vercel. Use Neon PostgreSQL and application-hosted Better Auth. Preserve the development-only local backend; production cloud mode is explicit and fails closed when misconfigured. Public reads use an independent, whitelisted published snapshot, never private state.

**Tech Stack:** Next.js 16.3.4, React 19, TypeScript, Better Auth, pg, Neon PostgreSQL.

**Status (2026-09-07):** Implementation, the final quality gate/build, and real Neon auth/library checks are complete. Production environment preparation and the 274-resource published baseline are complete. Browser verification confirmed test-owner login, private saves, explicit publication, withdrawal, and logout; the disposable verification resource has been disconnected and deleted. The production owner account count is currently zero, so owner setup, final cloud activation, production deployment, and live verification remain pending. See `docs/reports/2026-09-07-cloud-resource-manager-verification.md`.

## 1. Configuration and owner authentication

- [x] Create `src/lib/server/config.ts`, `database.ts`, `auth.ts`, `/api/auth/[...all]`.
- [x] Use lazy database/auth initialization, fixed owner ID, closed public signup, database-backed rate limits, secure sessions, same-origin auth and private API requests.
- [x] Provide safe CLI schema/owner setup and password recovery. Credentials stay in ignored environment files or platform configuration, never command arguments or chat output. Recovery email is offered only when configured.
- [x] Verify anonymous, non-owner, expired session, CSRF, signup and unconfigured production failures.

## 2. Cloud library and migration

- [x] Create cloud library adapter and SQL migration. Reuse existing validation and publication projection.
- [x] Execute each mutation in a transaction; use a required library revision for stale-write detection, plus publication preview revision.
- [x] Keep separate private library and public snapshot rows. Public DB role has no private/auth access; public reading module never loads private rows.
- [x] Provide explicit, idempotent initialization from the actual published file/legacy baseline. Never initialize from a user request; empty published snapshots remain valid.
- [x] Provide reviewed private backup migration/restore workflow that preserves private fields and cannot publish implicitly.
- [x] Test normal save vs publish, stale writers, undo import, private field exclusion, empty snapshots, rollback and migration.

## 3. UI integration

- [x] Add static management link to public resource navigation, `/login`, optional recovery UI, and logout.
- [x] Adapt existing manager components to local/cloud modes, authenticated API and revision feedback. Preserve approved typography.
- [x] Explain online publication and show pending withdrawal; keep edited text on failures.

## 4. Public reads and API integration

- [x] Root adds authenticated `/api/library` with bounded bodies, same-origin enforcement and no-store responses.
- [x] Root adds asynchronous published-only data facade for homepage and tools page. Use shared tagged cache, 60-second revalidation, explicit publication invalidation and clear retry status.
- [x] Cloud failure or empty snapshot must never fall back to legacy content. No cloud configuration means the old public website remains operational and production private routes remain closed.

## 5. Verification and deployment preparation

- [x] Run default regression checks, the quality gate, and production build; complete real Neon auth and library integration checks against separate disposable targets in the verification project.
- [x] Verify production/verification project isolation, production schema/state/snapshot readiness, and the published baseline of 274 resources without copying production private data into tests.
- [x] Prepare Neon/Vercel configuration and account setup instructions. Required production secrets and connection variables are scoped to Production and marked Sensitive; the cloud-mode activation variable remains absent.
- [x] Confirm browser login with the isolated test owner and successful private resource saves.
- [x] Finish browser acceptance of explicit publication and withdrawal, including consistent public-page results and logout access checks. Prior local desktop/mobile layout checks remain valid; actual cross-device production login awaits deployment.
- [x] Disconnect and delete the disposable verification resource after completing database and browser checks.
- [ ] Complete the production owner's password setup and verify exactly one configured owner with a credential account. The latest read-only check found zero production users and zero credential accounts; this step is awaiting the user.
- [ ] Enable cloud mode and deploy production only after owner setup and final acceptance pass. Final activation and deployment are still pending; keep real private backups outside Git and production data isolated from preview and unrelated projects.

## Contracts between parallel tasks

- Config: `cloudLibraryEnabled(): boolean`; env `RESOURCE_LIBRARY_MODE=cloud`, `DATABASE_URL`, `LIBRARY_PUBLIC_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `LIBRARY_OWNER_ID`.
- DB: `getDatabasePool(): import('pg').Pool`; private/auth operations use server-only connection.
- Auth: `getAuth()`; `getOwnerSession(headers: Headers)` returns an owner session or null; requires immutable owner ID.
- Cloud library: `handleCloudLibraryAction(input: unknown, ownerId: string)`; list/mutation responses carry `libraryRevision`; mutation requests require `libraryRevision`; existing publish `revision` remains separate.
- Public read: `readCloudPublicSnapshot(): Promise<PublicLibrarySnapshot>`; no private-table query, no legacy fallback.
- Manager: `ResourceManager` accepts `mode: 'local' | 'cloud'` and optional `email`; cloud endpoint `/api/library`, local endpoint `/api/local-library`.

This supersedes the Supabase-specific provider choice in the earlier design. The privacy, migration and explicit publication requirements remain applicable.
