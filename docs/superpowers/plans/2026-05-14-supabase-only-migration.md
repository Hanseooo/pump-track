# Supabase-Only Migration + Command Poll Interval Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Upstash Redis with Supabase PostgreSQL for all state storage, add configurable `commandPollSec` setting, and fix the `DEFAULT_SETTINGS.intervalMin` bug.

**Architecture:** Single-source-of-truth in PostgreSQL via two singleton tables (`app_settings`, `app_state`). All business logic in `irrigation-service.ts` rewritten to use Supabase helpers. Dashboard optionally upgraded to Supabase Realtime for instant updates. Arduino firmware gains independent command-polling timer.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, Supabase PostgreSQL, Upstash Redis (being removed), Arduino C++.

---

## File Structure

### New Files
- None (all changes are modifications to existing files)

### Modified Files
| File | Responsibility |
|------|---------------|
| `src/lib/types.ts` | Add `commandPollSec` to `Settings` interface |
| `src/lib/supabase.ts` | Add `getSettings()`, `saveSettings()`, `getAppState()`, `setAppState()`, `setPumpCommand()`, `deletePumpCommand()` helpers |
| `src/lib/services/irrigation-service.ts` | Rewrite all Redis calls to Supabase; fix `DEFAULT_SETTINGS` bug |
| `src/app/api/reading/route.ts` | Verify no Redis imports remain; ensure response shape unchanged |
| `src/app/api/command/route.ts` | Verify no Redis imports remain |
| `src/app/api/pump/route.ts` | Verify no Redis imports remain |
| `src/app/api/latest/route.ts` | Verify no Redis imports remain |
| `src/app/api/settings/route.ts` | Verify no Redis imports remain |
| `src/app/api/logs/route.ts` | No changes expected (already Supabase-only) |
| `src/components/settings-form.tsx` | Add `commandPollSec` slider/input |
| `src/app/page.tsx` | Optional: add Supabase Realtime subscription |
| `src/app/settings/page.tsx` | Pass `commandPollSec` to form |
| `package.json` | Remove `@upstash/redis` dependency |
| `.env.example` | Remove `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| `docs/dev/SCHEMA.md` | Document `app_settings` and `app_state` tables |
| `docs/dev/BACKEND.md` | Remove Redis references |
| `docs/dev/SETUP.md` | Remove Redis setup instructions |

### Deleted Files
| File | Reason |
|------|--------|
| `src/lib/redis.ts` | Redis client no longer needed |

---

## Chunk 1: Database Schema & Types

### Task 1: Create Supabase Tables

**Files:**
- Modify: `docs/dev/SCHEMA.md`
- Action: Run SQL in Supabase SQL Editor

**Prerequisite:** Access to Supabase project SQL Editor.

- [ ] **Step 1: Write SQL migration**

Run this SQL in the Supabase SQL Editor:

```sql
-- Single-row settings table (replaces Redis 'settings' hash)
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  threshold INTEGER NOT NULL DEFAULT 40 CHECK (threshold BETWEEN 0 AND 100),
  interval_min INTEGER NOT NULL DEFAULT 5 CHECK (interval_min BETWEEN 1 AND 30),
  pump_sec INTEGER NOT NULL DEFAULT 5 CHECK (pump_sec BETWEEN 1 AND 60),
  command_poll_sec INTEGER NOT NULL DEFAULT 30 CHECK (command_poll_sec BETWEEN 5 AND 300),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Prevent deletion of the singleton row
INSERT INTO app_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Single-row state table (replaces Redis 'latest', 'pump_command', 'pump_status')
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pump_status TEXT DEFAULT 'idle' CHECK (pump_status IN ('idle', 'pending', 'running', 'error')),
  pump_command TEXT,
  pump_command_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Enable Realtime for app_state if dashboard will use it
ALTER PUBLICATION supabase_realtime ADD TABLE app_state;
ALTER PUBLICATION supabase_realtime ADD TABLE readings;
```

- [ ] **Step 2: Verify tables exist**

Run in Supabase SQL Editor:
```sql
SELECT * FROM app_settings;
SELECT * FROM app_state;
```

Expected: Each returns exactly one row with default values.

- [ ] **Step 3: Update SCHEMA.md**

Add the following section to `docs/dev/SCHEMA.md` (find the existing `readings` table and append after it):

```markdown
### `app_settings` (singleton configuration)

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | integer | PRIMARY KEY, CHECK (id = 1) | 1 |
| threshold | integer | CHECK (0..100) | 40 |
| interval_min | integer | CHECK (1..30) | 5 |
| pump_sec | integer | CHECK (1..60) | 5 |
| command_poll_sec | integer | CHECK (5..300) | 30 |
| updated_at | timestamptz | | now() |

### `app_state` (singleton runtime state)

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | integer | PRIMARY KEY, CHECK (id = 1) | 1 |
| pump_status | text | CHECK ('idle'\|'pending'\|'running'\|'error') | 'idle' |
| pump_command | text | nullable | null |
| pump_command_expires_at | timestamptz | nullable | null |
| updated_at | timestamptz | | now() |
```

- [ ] **Step 4: Commit**

```bash
git add docs/dev/SCHEMA.md
git commit -m "docs: document app_settings and app_state tables"
```

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Read current types**

Read `src/lib/types.ts` to confirm current `Settings` shape.

- [ ] **Step 2: Add `commandPollSec` to `Settings`**

Replace the `Settings` interface with:

```typescript
export interface Settings {
  threshold: number;      // 0-100, default 40
  intervalMin: number;    // 1-30, default 5
  pumpSec: number;        // 1-60, default 5
  commandPollSec: number; // 5-300, default 30 (NEW)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add commandPollSec to Settings interface"
```

---

## Chunk 2: Supabase Data Layer

### Task 3: Add Settings & State Helpers to `supabase.ts`

**Files:**
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Read current `supabase.ts`**

Read `src/lib/supabase.ts` to find insertion point (after existing helpers).

- [ ] **Step 2: Add settings helpers**

Append to `src/lib/supabase.ts`:

```typescript
// ── Settings (singleton) ──────────────────────────────────

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    // Return defaults if row missing
    return {
      threshold: 40,
      intervalMin: 5,
      pumpSec: 5,
      commandPollSec: 30,
    };
  }

  return {
    threshold: data.threshold,
    intervalMin: data.interval_min,
    pumpSec: data.pump_sec,
    commandPollSec: data.command_poll_sec,
  };
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const clamped = {
    threshold: Math.max(0, Math.min(100, settings.threshold)),
    interval_min: Math.max(1, Math.min(30, settings.intervalMin)),
    pump_sec: Math.max(1, Math.min(60, settings.pumpSec)),
    command_poll_sec: Math.max(5, Math.min(300, settings.commandPollSec)),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('app_settings')
    .upsert({ id: 1, ...clamped });

  if (error) throw error;

  return {
    threshold: clamped.threshold,
    intervalMin: clamped.interval_min,
    pumpSec: clamped.pump_sec,
    commandPollSec: clamped.command_poll_sec,
  };
}

// ── App State (singleton) ─────────────────────────────────

export async function getAppState(): Promise<{
  pumpStatus: string;
  pumpCommand: string | null;
  pumpCommandExpiresAt: string | null;
}> {
  const { data, error } = await supabase
    .from('app_state')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return {
      pumpStatus: 'idle',
      pumpCommand: null,
      pumpCommandExpiresAt: null,
    };
  }

  return {
    pumpStatus: data.pump_status,
    pumpCommand: data.pump_command,
    pumpCommandExpiresAt: data.pump_command_expires_at,
  };
}

export async function setPumpStatus(status: string): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .upsert({
      id: 1,
      pump_status: status,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

export async function setPumpCommand(): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .upsert({
      id: 1,
      pump_command: 'true',
      pump_command_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

export async function deletePumpCommand(): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .update({
      pump_command: null,
      pump_command_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  if (error) throw error;
}

export async function setPumpCommandExpired(): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .update({
      pump_command: null,
      pump_command_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  if (error) throw error;
}
```

- [ ] **Step 3: Import `Settings` type at top of file**

Ensure the file imports `Settings`:
```typescript
import { Reading, Settings } from './types';
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm build`
Expected: Build succeeds (may fail later due to irrigation-service.ts — that is expected at this stage).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat(supabase): add settings and app_state helpers"
```

---

## Chunk 3: Business Logic Rewrite

### Task 4: Rewrite `irrigation-service.ts`

**Files:**
- Modify: `src/lib/services/irrigation-service.ts`

- [ ] **Step 1: Read current file**

Read `src/lib/services/irrigation-service.ts` to understand all Redis call sites.

- [ ] **Step 2: Replace imports**

Replace:
```typescript
import { redis } from '@/lib/redis';
```
With:
```typescript
import {
  getSettings as getSettingsFromDb,
  saveSettings as saveSettingsToDb,
  getLatestReading,
  getLastPumpReading,
  getAppState,
  setPumpStatus,
  setPumpCommand,
  deletePumpCommand,
  setPumpCommandExpired,
  insertReading,
} from '@/lib/supabase';
```

- [ ] **Step 3: Fix `DEFAULT_SETTINGS` bug**

Replace:
```typescript
const DEFAULT_SETTINGS: Settings = {
  threshold: 40,
  intervalMin: 30,  // BUG
  pumpSec: 5,
};
```
With:
```typescript
const DEFAULT_SETTINGS: Settings = {
  threshold: 40,
  intervalMin: 5,
  pumpSec: 5,
  commandPollSec: 30,
};
```

- [ ] **Step 4: Rewrite `getSettings()`**

Replace with:
```typescript
export async function getSettings(): Promise<Settings> {
  try {
    return await getSettingsFromDb();
  } catch {
    return DEFAULT_SETTINGS;
  }
}
```

- [ ] **Step 5: Rewrite `saveSettings()`**

Replace with:
```typescript
export async function saveSettings(settings: Settings): Promise<Settings> {
  return saveSettingsToDb(settings);
}
```

- [ ] **Step 6: Delete `getLatestFromRedis()` and `updateLatest()`**

These functions are no longer needed. The dashboard will use `getLatestReading()` from Supabase.

- [ ] **Step 7: Rewrite `getPumpStatus()`**

Replace with:
```typescript
export async function getPumpStatus(): Promise<PumpStatus> {
  const state = await getAppState();

  // Check expiry
  if (state.pumpCommand && state.pumpCommandExpiresAt) {
    const expires = new Date(state.pumpCommandExpiresAt).getTime();
    if (Date.now() > expires) {
      await setPumpCommandExpired();
      return 'error';
    }
  }

  return (state.pumpStatus as PumpStatus) || 'idle';
}
```

- [ ] **Step 8: Rewrite `setPumpStatus()`**

Replace with:
```typescript
export async function setPumpStatus(status: PumpStatus): Promise<void> {
  await setPumpStatus(status);
}
```

Wait — this creates a naming collision. Rename the local wrapper to avoid shadowing:

```typescript
export async function setPumpStatus(status: PumpStatus): Promise<void> {
  await _setPumpStatus(status); // imported as setPumpStatus from supabase.ts
}
```

Actually, better approach: don't re-export wrappers that just call through. Import the Supabase helper with a descriptive name:

```typescript
import { setPumpStatus as setPumpStatusInDb } from '@/lib/supabase';
```

Then:
```typescript
export async function setPumpStatus(status: PumpStatus): Promise<void> {
  await setPumpStatusInDb(status);
}
```

Do the same for all helpers to avoid shadowing.

- [ ] **Step 9: Rewrite `getPumpCommand()`**

Replace with:
```typescript
export async function getPumpCommand(): Promise<string | null> {
  const state = await getAppState();

  if (!state.pumpCommand) return null;

  // Check expiry
  if (state.pumpCommandExpiresAt) {
    const expires = new Date(state.pumpCommandExpiresAt).getTime();
    if (Date.now() > expires) {
      await setPumpCommandExpired();
      return null;
    }
  }

  return state.pumpCommand;
}
```

- [ ] **Step 10: Rewrite `setPumpCommand()`**

Replace with:
```typescript
export async function setPumpCommand(): Promise<void> {
  await setPumpCommandInDb();
}
```

- [ ] **Step 11: Rewrite `deletePumpCommand()`**

Replace with:
```typescript
export async function deletePumpCommand(): Promise<void> {
  await deletePumpCommandInDb();
}
```

- [ ] **Step 12: Rewrite `recordReading()`**

Remove the `updateLatest(moisture)` call. Keep everything else:

```typescript
export async function recordReading(moisture: number): Promise<{ shouldPump: boolean }> {
  const settings = await getSettings();
  const shouldPump = moisture < settings.threshold;

  await insertReading({
    moisture,
    pump_fired: shouldPump,
    trigger: 'auto',
  });

  if (shouldPump) {
    await setPumpCommandInDb();
    await setPumpStatusInDb('pending');
  }

  return { shouldPump };
}
```

- [ ] **Step 13: Rewrite `triggerManualPump()`**

Replace with:
```typescript
export async function triggerManualPump(): Promise<void> {
  const latest = await getLatestReading();
  const moisture = latest?.moisture ?? 50;

  await setPumpCommandInDb();
  await setPumpStatusInDb('pending');

  await insertReading({
    moisture,
    pump_fired: true,
    trigger: 'manual',
  });
}
```

- [ ] **Step 14: Rewrite `getDashboardData()`**

Replace with:
```typescript
export async function getDashboardData(): Promise<{
  moisture: number | null;
  ts: number | null;
  pumpStatus: PumpStatus;
  lastPump: Reading | null;
}> {
  const [latest, pumpStatus, lastPump] = await Promise.all([
    getLatestReading(),
    getPumpStatus(),
    getLastPumpReading(),
  ]);

  return {
    moisture: latest?.moisture ?? null,
    ts: latest ? new Date(latest.created_at).getTime() : null,
    pumpStatus,
    lastPump,
  };
}
```

- [ ] **Step 15: Verify TypeScript compiles**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 16: Commit**

```bash
git add src/lib/services/irrigation-service.ts
git commit -m "feat(service): migrate irrigation service from Redis to Supabase"
```

---

## Chunk 4: API Routes Verification

### Task 5: Remove Redis Imports from API Routes

**Files:**
- Modify: `src/app/api/reading/route.ts`
- Modify: `src/app/api/command/route.ts`
- Modify: `src/app/api/pump/route.ts`
- Modify: `src/app/api/latest/route.ts`
- Modify: `src/app/api/settings/route.ts`

- [ ] **Step 1: Read each route file**

Read all 5 route files to check for direct Redis imports.

- [ ] **Step 2: Remove any `import { redis } from '@/lib/redis'`**

Expected: None of these files should import Redis directly (they all delegate to `irrigation-service.ts`), but verify.

- [ ] **Step 3: Verify response shapes are unchanged**

Ensure each route returns the same JSON shape so Arduino firmware and dashboard don't break:

| Route | Expected Response |
|-------|-----------------|
| `POST /api/reading` | `{ ok: true, shouldPump: boolean }` |
| `GET /api/command` | `{ pump: boolean }` |
| `POST /api/pump` | `{ ok: true }` |
| `GET /api/latest` | `{ moisture, ts, pumpStatus, lastPump }` |
| `GET /api/settings` | `{ threshold, intervalMin, pumpSec, commandPollSec }` |
| `POST /api/settings` | `{ ok: true, settings }` |

- [ ] **Step 4: Fix `GET /api/settings` response**

Ensure `src/app/api/settings/route.ts` returns `commandPollSec` in the JSON.

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/
git commit -m "refactor(api): verify routes work with Supabase-only backend"
```

---

## Chunk 5: UI Updates

### Task 6: Update Settings Form with `commandPollSec`

**Files:**
- Modify: `src/components/settings-form.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Read current settings form**

Read `src/components/settings-form.tsx` and `src/app/settings/page.tsx`.

- [ ] **Step 2: Add `commandPollSec` input**

Add a new form field between `pumpSec` and the submit button:

```tsx
<div className="space-y-2">
  <Label htmlFor="commandPollSec">
    Manual Trigger Poll Interval (seconds)
  </Label>
  <Input
    id="commandPollSec"
    type="number"
    min={5}
    max={300}
    value={settings.commandPollSec}
    onChange={(e) =>
      setSettings({
        ...settings,
        commandPollSec: parseInt(e.target.value, 10) || 30,
      })
    }
  />
  <p className="text-sm text-muted-foreground">
    How often Arduino checks for manual pump triggers (5–300 sec).
  </p>
</div>
```

- [ ] **Step 3: Update default state in form**

Ensure the form initializes with `commandPollSec: 30`.

- [ ] **Step 4: Update `src/app/settings/page.tsx` if it passes defaults**

Ensure the server component passes `commandPollSec` through.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings-form.tsx src/app/settings/page.tsx
git commit -m "feat(settings): add commandPollSec input to settings form"
```

---

### Task 7: Optional — Add Supabase Realtime to Dashboard

**Files:**
- Modify: `src/app/page.tsx`

**Note:** This is optional. If skipped, dashboard continues 30s HTTP polling.

- [ ] **Step 1: Read current dashboard page**

Read `src/app/page.tsx` to understand current polling logic.

- [ ] **Step 2: Add Supabase browser client**

Create a browser-safe Supabase client in `src/lib/supabase-browser.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import { Database } from './types'; // if you have generated types

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey);
```

**Environment variable note:** Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in `.env.local` and Vercel.

- [ ] **Step 3: Replace polling with Realtime subscription**

In `src/app/page.tsx`, replace:
```typescript
useEffect(() => {
  const timer = setTimeout(() => fetchData(), 0);
  const interval = setInterval(fetchData, 30000);
  const nowInterval = setInterval(() => setNow(Date.now()), 60000);
  return () => {
    clearTimeout(timer);
    clearInterval(interval);
    clearInterval(nowInterval);
  };
}, [fetchData]);
```

With:
```typescript
useEffect(() => {
  // Fetch immediately on mount
  fetchData();

  // Subscribe to realtime updates
  const channel = supabaseBrowser
    .channel('irrigation_changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'readings' },
      () => fetchData()
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'app_state' },
      () => fetchData()
    )
    .subscribe();

  const nowInterval = setInterval(() => setNow(Date.now()), 60000);

  return () => {
    supabaseBrowser.removeChannel(channel);
    clearInterval(nowInterval);
  };
}, [fetchData]);
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase-browser.ts src/app/page.tsx
git commit -m "feat(dashboard): add Supabase Realtime for instant updates"
```

---

## Chunk 6: Cleanup

### Task 8: Remove Redis Dependency

**Files:**
- Delete: `src/lib/redis.ts`
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Delete `src/lib/redis.ts`**

```bash
rm src/lib/redis.ts
```

- [ ] **Step 2: Remove `@upstash/redis` from `package.json`**

Find and remove the line:
```json
"@upstash/redis": "^1.37.0",
```

- [ ] **Step 3: Remove Redis env vars from `.env.example`**

Remove:
```
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- [ ] **Step 4: Run `pnpm install`**

```bash
pnpm install
```

- [ ] **Step 5: Run `pnpm build`**

```bash
pnpm build
```
Expected: Build succeeds with no Redis references.

- [ ] **Step 6: Run `pnpm lint`**

```bash
pnpm lint
```
Expected: No lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/redis.ts package.json pnpm-lock.yaml .env.example
git commit -m "chore: remove Upstash Redis dependency"
```

---

## Chunk 7: Documentation Updates

### Task 9: Update Developer Docs

**Files:**
- Modify: `docs/dev/BACKEND.md`
- Modify: `docs/dev/SETUP.md`

- [ ] **Step 1: Remove Redis references from BACKEND.md**

Replace any mention of Redis with Supabase `app_settings` / `app_state` tables.

- [ ] **Step 2: Remove Redis setup from SETUP.md**

Delete sections about creating Upstash Redis instance and adding env vars.

- [ ] **Step 3: Commit**

```bash
git add docs/dev/
git commit -m "docs: remove Redis references from backend and setup docs"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `pnpm install` succeeds
- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm build` succeeds
- [ ] Arduino `GET /api/settings` returns `commandPollSec`
- [ ] Arduino `POST /api/reading` stores reading and returns `shouldPump`
- [ ] Arduino `GET /api/command` returns `{ pump: true }` after manual trigger
- [ ] Manual trigger sets `pump_status` to `pending`, then `running`, then `idle`
- [ ] Dashboard `/api/latest` returns latest moisture, timestamp, pump status, last pump
- [ ] Settings page saves and loads `commandPollSec`
- [ ] No Redis env vars in Vercel dashboard (remove if present)
- [ ] Supabase tables `app_settings` and `app_state` have exactly one row each

---

## Rollback Plan

If issues arise during deployment:

1. Re-add `src/lib/redis.ts` from git history
2. Re-add `@upstash/redis` to `package.json`
3. Restore original `irrigation-service.ts`
4. Re-add Redis env vars to Vercel
5. `pnpm install && pnpm build && pnpm lint`

The original Redis-backed code remains in git history and can be restored in ~5 minutes.

---

**Plan created:** 2026-05-14
**Estimated implementation time:** 2–3 hours
**Risk level:** Medium — touches core business logic and all API routes
