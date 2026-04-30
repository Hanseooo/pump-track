# AGENTS.md

## Metadata
- Owner: Hans
- Last reviewed: 2026-04-30
- Review cadence: monthly

## Repository Signals Checklist
- **Lockfile audit:** `pnpm-lock.yaml` exists → canonical package manager is **pnpm**.
- **Monorepo/workspace detection:** `pnpm-workspace.yaml` exists but defines no packages (only `ignoredBuiltDependencies`). Treat as single-package repo managed by pnpm.
- **TypeScript style:** `.ts` / `.tsx` throughout; `tsconfig.json` maps `@/*` to `src/*`.
- **Python env/tooling evidence:** None detected.
- **Other structural signals:**
  - `next.config.ts` → Next.js 16 (App Router, TypeScript).
  - `postcss.config.mjs` + Tailwind v4 (`tailwindcss@4.2.4`).
  - `components.json` → shadcn/ui initialized.
  - `docs/dev/` contains PRD, SCHEMA, BACKEND, DASHBOARD, SETUP, modularity docs.

## Scope & Precedence *(covers /project-agents scope)*
- Global safety/security rules remain primary. Conflict order: Safety/data integrity > Security > User intent/spec > Workflow/process > Style.
- This file records repo-specific deltas; any deviation from personal/global config is noted in **Validation Notes**.
- No module-level AGENTS files detected; root guidance applies everywhere.

## Project Context *(covers /team-agents project context)*
- **Stack:** Next.js 16 (App Router, TypeScript), Tailwind CSS v4 + shadcn/ui, Supabase (PostgreSQL via `@supabase/supabase-js`), Upstash Redis (`@upstash/redis`), Vercel.
- **Architecture:** IoT irrigation dashboard. Arduino submits moisture readings and polls pump commands. Dashboard displays live moisture, manual pump trigger, settings, and logs. API routes in `src/app/api/` must remain **thin controllers**; complex business logic belongs in `src/lib/services/`.
- **Critical paths:**
  - Arduino auth (`/api/reading`, `/api/command`) — `x-api-key` validation against `ARDUINO_API_KEY`.
  - Manual pump trigger (`/api/pump`).
  - Settings read/write in Redis.
  - `.env.local` handling (secrets must never reach client).
- **Next.js 16 warning:** This is NOT the Next.js from training data. APIs, conventions, and file structure have breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js code. Heed deprecation notices.

## Documentation Context Map
- **Always read:**
  1. `docs/dev/PRD.md` — product requirements, features, constraints.
  2. `docs/dev/SCHEMA.md` — database schema, API spec, data shapes, validation rules.
  3. `docs/dev/modularity.md` — architecture patterns and layering rules.
- **Read when:**
  - API route work → `docs/dev/BACKEND.md`
  - UI/page/component work → `docs/dev/DASHBOARD.md`
  - Setup/env issues → `docs/dev/SETUP.md`
- **Missing/sparse docs fallback:** Docs are present and high-signal. If they conflict with executable evidence (package scripts, CI, code), prefer executable evidence and log the conflict in **Validation Notes**.

## Commands (Use Exactly)
- **Install:** `pnpm install` (evidence: `pnpm-lock.yaml` + `pnpm-workspace.yaml`).
- **Lint:** `pnpm lint` (evidence: `package.json` scripts; runs `eslint`).
- **Build/Typecheck:** `pnpm build` (evidence: `package.json` scripts; runs `next build`).
- **Dev server:** `pnpm dev` (evidence: `package.json` scripts; runs `next dev`).
- **Unit tests:** Not configured (evidence: no test runner in `package.json` scripts or dependencies).
- **Integration/E2E:** Not configured.
- **Pre-merge verify:**
  ```bash
  pnpm install && pnpm lint && pnpm build
  ```
  (Assumption: safest sequence; no test suite exists.)

### Granular Testing *(single-file & single-case required)*
- **Not evidenced.** No test runner is configured. If tests are added later, document the exact single-file and single-case CLI flags here (e.g., `pnpm vitest run path/to/test.ts -t "case name"`).

## Policy Tiers
- **MUST — blocking requirements; violation halts work.**
  - App Router only. Never create a `pages/` directory. All routes go in `src/app/`.
  - TypeScript everywhere. All files use `.ts` or `.tsx`. No `.js` files except config.
  - No `middleware.ts`. Next.js 16 uses `proxy.ts`. This project does not need either.
  - Caching is opt-in in Next.js 16. Do not add `cache: 'no-store'` unless there is a specific reason.
  - Arduino-facing routes (`/api/reading`, `/api/command`) MUST validate `x-api-key` header against `process.env.ARDUINO_API_KEY`.
  - Never expose `ARDUINO_API_KEY` to the client. It is a server-only env variable.
  - Never commit `.env.local`. It is gitignored.
  - Use `@/` imports. The tsconfig alias `@/*` maps to `src/*`.
  - Import shadcn/ui from `@/components/ui/`. Do not install or use other UI libraries.
  - Server Components by default. Only add `'use client'` when the component uses `useState`, `useEffect`, event handlers, or browser APIs.
  - Do not use `fetch` in Server Components with `cache: 'force-cache'` — Next.js 16 defaults to dynamic.
  - Do not use `export const dynamic = 'force-dynamic'` — already the default in Next.js 16.
  - Do not import `supabase` in client components — it contains server-only env vars.
  - Do not use `router.refresh()` after mutations in Server Components — use `revalidatePath` instead.
  - Do not wrap API routes in `try/catch` and swallow errors silently — always return a typed error response.
- **SHOULD — strong default; deviations must be justified in Validation Notes.**
  - Read the relevant doc section before editing files (BACKEND.md for routes, DASHBOARD.md for pages).
  - Match the exact types defined in `src/lib/types.ts`.
  - Use the Supabase client from `src/lib/supabase.ts` — do not create new instances.
  - Use the auth helper from `src/lib/auth.ts` for Arduino-facing routes.
  - Keep Server Components async — fetch data directly without `useEffect` where possible.
  - Keep Client Components lean — only use `'use client'` for interactivity.
- **MAY — optional guidance; apply when it fits task constraints.**
  - Use `revalidatePath` after server-side mutations.

## Definition of Done (project-specific)
- Completion report MUST list:
  1. Commands run.
  2. Key results (lint pass, build pass, manual test output).
  3. What was verified vs not verified.
  4. Residual risks or limitations.
  5. Runtime context when tests were executed (Node version, pnpm version).
- For user-visible changes: include before/after behavior notes.
- For API changes: include manual test evidence (curl, fetch, or log output).

## Risk Controls
- **Never read `.env` files or secrets.** Request sanitized inputs from the user instead.
- Run a pre-commit secret scan if any env-related files are modified.
- Do not install dependencies globally; use `pnpm`.
- Avoid `eval()` / `exec()` with unsanitized input; avoid dynamic SQL string concatenation.
- If a hardcoded secret is found, flag it immediately before continuing.

## Planning and Execution
- Plan first for efforts touching >=3 files or needing sequencing.
- Include verification strategy in reasoning mode, not just implementation steps.
- Stop after 2 failed attempts; send a blocked report with:
  - What was tried.
  - Concrete evidence.
  - Current hypothesis.
  - Exact blocker.
  - Recommended next step.
- Ask one focused question when ambiguity affects outcome.
- Avoid TODO comments without a linked GitHub issue.

## Scope-Control Rules
- No unrelated refactors inside focused PRs.
- One concern per PR/branch unless explicitly approved.
- Stop and re-plan when new evidence appears.
- Capture follow-ups as tasks/issues instead of expanding scope mid-PR.

## Validation Notes
- **No test runner configured.** Pre-merge verify relies on `pnpm lint` and `pnpm build` only.
- **pnpm workspace detected but empty.** `pnpm-workspace.yaml` contains only `ignoredBuiltDependencies`; repo behaves as a single package.
- **Next.js 16 local docs.** Version-locked docs live in `node_modules/next/dist/docs/`. Always consult these before writing Next.js-specific code.
- **Missing evidence:** No CI workflow file detected; pre-merge verify sequence is an assumption based on `package.json` scripts.

## Tooling Lock
- **Canonical package manager:** pnpm.
- **Forbidden alternatives:** npm, yarn, bun (not evidenced by lockfiles).

## Architecture Boundaries
- API routes must be thin controllers. Complex business logic MUST live in `src/lib/services/`.
- Do not create new Supabase client instances. Always import from `src/lib/supabase.ts`.

## Project-Specific Invariants
- Next.js 16 breaking changes: read local docs in `node_modules/next/dist/docs/` before writing Next.js code.
- Caching is opt-in in Next.js 16. Do not add `cache: 'no-store'` without a specific reason.
- Dashboard routes (`/api/pump`, `/api/latest`, `/api/logs`, `/api/settings`) do not require auth.

## Self-Correction Protocol
- Update stale policy references immediately when disproven by code or docs.
- Append only truly new corrections; avoid duplicate rule accumulation.
- If `tasks/lessons.md` is created later, review it before editing and add lessons after corrections.

## References
- `docs/dev/PRD.md` — product scope
- `docs/dev/SCHEMA.md` — data model & API contracts
- `docs/dev/modularity.md` — architecture rules
- `docs/dev/BACKEND.md` — API route implementations
- `docs/dev/DASHBOARD.md` — page & component implementations
- `docs/dev/SETUP.md` — environment setup
