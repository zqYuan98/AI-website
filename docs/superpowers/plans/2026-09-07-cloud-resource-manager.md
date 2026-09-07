# Cloud Resource Manager Implementation Plan

> **For agentic workers:** Use subagent-driven development with independent auth, storage, and UI ownership. Root integrates and verifies the full flow.

**Goal:** Open the existing resource manager online to one password-authenticated owner, with private cloud storage and explicit publication.

**Architecture:** Keep Next.js on Vercel. Use Neon PostgreSQL and application-hosted Better Auth. Preserve the development-only local backend; production cloud mode is explicit and fails closed when misconfigured. Public reads use an independent, whitelisted published snapshot, never private state.

**Tech Stack:** Next.js 16.3.4, React 19, TypeScript, Better Auth, pg, Neon PostgreSQL.

**Status:** Code, isolated PostgreSQL/auth checks, production build, closed-mode HTTP smoke and responsive local UI checks are complete. Real Neon/Vercel provisioning, production account setup, cross-device browser verification and deployment remain pending account access. See `docs/reports/2026-09-07-cloud-resource-manager-verification.md`.

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

- [ ] Run database-backed integration checks in an isolated test DB, existing quality gate and production build; inspect desktop/mobile login and manager flows.
- [ ] Prepare exact Neon/Vercel configuration and account setup instructions. Use available authorized account access; if absent, request the concrete missing account step while finishing independent work.
- [ ] Enable production only after schema, owner, publication baseline and environment variables are verified. Keep real private backups outside Git. Do not silently bind production data to preview or unrelated Vercel projects.

## Contracts between parallel tasks

- Config: `cloudLibraryEnabled(): boolean`; env `RESOURCE_LIBRARY_MODE=cloud`, `DATABASE_URL`, `PUBLIC_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `LIBRARY_OWNER_ID`.
- DB: `getDatabasePool(): import('pg').Pool`; private/auth operations use server-only connection.
- Auth: `getAuth()`; `getOwnerSession(headers: Headers)` returns an owner session or null; requires immutable owner ID.
- Cloud library: `handleCloudLibraryAction(input: unknown, ownerId: string)`; list/mutation responses carry `libraryRevision`; mutation requests require `libraryRevision`; existing publish `revision` remains separate.
- Public read: `readCloudPublicSnapshot(): Promise<PublicLibrarySnapshot>`; no private-table query, no legacy fallback.
- Manager: `ResourceManager` accepts `mode: 'local' | 'cloud'` and optional `email`; cloud endpoint `/api/library`, local endpoint `/api/local-library`.

This supersedes the Supabase-specific provider choice in the earlier design. The privacy, migration and explicit publication requirements remain applicable.
