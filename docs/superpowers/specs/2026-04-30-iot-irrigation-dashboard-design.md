# IoT Irrigation Dashboard — Design Spec

**Date:** 2026-04-30
**Status:** Approved
**Scope:** MVP single-zone irrigation dashboard with simulator

---

## 1. Overview

A Next.js 16 web dashboard for monitoring soil moisture and controlling a water pump. The system receives readings from an Arduino (simulated during development), displays live moisture levels, supports automatic and manual pump triggers, and maintains a historical log. Built with shadcn/ui, Tailwind CSS v4, Supabase PostgreSQL, and Upstash Redis.

### Key Constraints
- Single sensor / single pump (single-zone MVP)
- Dashboard-first development (IoT device built later)
- Zero-cost infrastructure (free tiers only)
- Responsive design (mobile + desktop)

---

## 2. Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Dashboard UI  │────▶│  Next.js API    │────▶│   Supabase PG   │
│   (Next.js 16)  │◀────│   Routes        │◀────│   (readings)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                ┌──────┴──────┐
        │                │             │
        ▼                ▼             ▼
┌─────────────────┐  ┌────────┐   ┌──────────┐
│  Simulator      │  │ Redis  │   │ In-Mem   │
│  (auto + manual)│  │ (KV)   │   │ Cache    │
└─────────────────┘  └────────┘   └──────────┘
```

### Stack
- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS v4 + shadcn/ui (radix-mira, zinc base)
- **Database:** Supabase PostgreSQL (`readings` table)
- **KV Store:** Upstash Redis (settings, latest reading, pump commands)
- **Icons:** `@hugeicons/react` (configured in `components.json`)
- **Package Manager:** pnpm

---

## 3. Components

### shadcn/ui Components (to install)
- `card` — content containers
- `badge` — status indicators
- `progress` — linear progress bars
- `sheet` — mobile navigation drawer
- `slider` — threshold slider in SettingsForm
- `dialog` — pump confirmation dialog
- `sonner` — toast notifications
- `table` — logs display
- `input` — form fields
- `label` — form labels
- `separator` — visual dividers
- `button` — already installed

### Custom Components

#### `Nav`
- Responsive navigation bar
- **Component type:** Client Component (`'use client'`) — requires `Sheet` state for mobile drawer
- Links: Dashboard (`/`), Logs (`/logs`), Settings (`/settings`)
- Mobile: hamburger menu → slide-out drawer (`Sheet` component)
- Desktop: horizontal top nav

#### `MoistureGauge`
- Circular progress indicator (0–100%) — custom SVG/CSS implementation (not a stock shadcn component)
- Color coding (relative to configured threshold):
  - `< threshold`: red (critical dry)
  - `≥ threshold`: green (healthy)
  - Optional: yellow band at threshold ± 10% for warning
- Displays exact percentage in center
- Shows "Last seen X min ago" below gauge when stale (>15 min)
- Stale state: dimmed colors, warning badge

#### `PumpCard`
- Current pump status: `idle`, `pending`, `running`, `error`
- Manual trigger button with confirmation dialog
- Shows last triggered time and trigger type (auto/manual) — sourced from most recent `readings` row where `pump_fired = true`
- Status badge color mapping:
  - `idle`: gray
  - `pending`: yellow (waiting for Arduino)
  - `running`: green
  - `error`: red

#### `SettingsForm`
- Moisture threshold slider (0–100%, default 40%)
- Reading interval input (minutes, 1–30, default 5) — `intervalMin`
- Pump duration input (seconds, 1–60, default 5) — maps to `pumpSec`
- Save button with loading state
- Validation: threshold 0–100, intervalMin 1–30, pumpSec 1–60

> **Note:** `auto_enabled` toggle is a post-MVP enhancement not in the original PRD. Auto-watering is implicitly active when a threshold is configured.

#### `LogsTable`
- Columns: Timestamp, Moisture %, Pump Fired, Trigger
- Pagination: 25 rows per page
- Sortable by timestamp (default: newest first)
- Empty state: "No readings yet"

#### `SimulatorControls`
- "Send Reading" button: POST to `/api/simulate` with random or manual moisture value
- "Trigger Pump" button: POST to `/api/pump`
- "Auto Simulator" toggle: POST to `/api/simulate` every 60 seconds
- Moisture input field (0–100) for manual readings

> **Security:** Simulator uses `/api/simulate` (no auth) instead of `/api/reading` (requires `x-api-key`). Both routes delegate to `IrrigationService.recordReading(moisture, { simulate: boolean })`. When `simulate: true`, the reading is stored and `latest` is updated, but `pump_command` is **not** created (prevents accidental physical pump triggers during testing).

---

## 4. Data Flow

### 4.1 Reading Ingestion
```
Simulator/Arduino → POST /api/reading
  ├── Validate x-api-key
  ├── Fetch settings from Redis (hgetall settings)
  ├── Determine shouldPump = moisture < settings.threshold
  ├── Insert into Supabase readings table (single row):
  │     moisture=<val>, pump_fired=shouldPump, trigger="auto"
  ├── Update Redis "latest" hash: hset latest moisture <val> ts <timestamp>
  ├── If shouldPump:
  │     SET Redis "pump_command" = "true" (EX 300)
  ├── If pump_status == "running":
  │     SET Redis "pump_status" = "idle"
  └── Return 200 { ok: true, shouldPump: <boolean> }
```

### 4.2 Dashboard Polling
```
Dashboard → GET /api/latest (every 30s)
  ├── Read Redis "latest" hash (hgetall)
  ├── Read Redis "pump_status"
  ├── Query Supabase for most recent pump_fired=true row
  └── Return { moisture, ts, pumpStatus, lastPump }
```

> **Note:** Polling interval is 30s per PRD.md F1. In-memory caching was considered but is unreliable on Vercel serverless (stateless, ephemeral). We read directly from Redis.

### 4.3 Manual Pump Trigger
```
Dashboard → POST /api/pump
  ├── Fetch latest moisture from Redis (hgetall latest)
  ├── If no readings exist yet (moisture is null):
  │     └── Return 400 { error: "No moisture reading available. Wait for first reading." }
  ├── SET Redis "pump_command" = "true" (EX 300)
  ├── SET Redis "pump_status" = "pending"
  ├── Insert into readings: moisture=<latest>, pump_fired=true, trigger="manual"
  └── Return 200 { ok: true }
```

> **UI behavior:** PumpCard disables the manual trigger button and shows "Waiting for first reading..." until `/api/latest` returns a valid moisture value.

> **Doc updates:** This PR rewrites BACKEND.md to reflect the new `pump_status` tracking, the no-readings guard clause, and the `GET /api/latest` extended response.

### 4.4 Arduino Poll
```
Arduino → GET /api/command
  ├── Validate x-api-key
  ├── GET Redis "pump_command"
  ├── If exists:
  │     ├── DEL Redis "pump_command"
  │     ├── SET Redis "pump_status" = "running"
  │     └── Return 200 { pump: true }
  └── If not exists:
        └── Return 200 { pump: false }
```

**Pump Status Expiry:**
- Dashboard checks `pump_status` on each poll / page load. If `pending` and `pump_command` no longer exists (TTL expired), dashboard transitions status to `error` and shows "Expired — retry?".

### 4.5 Settings
```
Dashboard → GET /api/settings
  ├── GET Redis "settings" hash (hgetall)
  └── Return { threshold, intervalMin, pumpSec }

Dashboard → POST /api/settings
  ├── Validate body: { threshold, intervalMin, pumpSec }
  ├── HSET Redis "settings" threshold <val> intervalMin <val> pumpSec <val>
  └── Return 200 { ok: true }
```

### 4.6 Logs Query
```
Dashboard → GET /api/logs?page=1&limit=25
  ├── Query Supabase: SELECT * ORDER BY created_at DESC LIMIT 25 OFFSET (page-1)*25
  ├── Get total count for pagination
  └── Return { readings: [], total, page, totalPages }
```

### 4.7 Arduino Startup Flow
```
Arduino boots → GET /api/settings
  ├── Read Redis "settings" hash
  └── Return { threshold, intervalMin, pumpSec }
```
> Arduino uses these values to configure its own polling interval and threshold check. This endpoint is public (no auth) — the Arduino does not need to authenticate for a read-only settings fetch.

---

## 5. API Routes

### Arduino-Facing (Auth Required: x-api-key)

#### `POST /api/reading`
**Headers:** `x-api-key: <ARDUINO_API_KEY>`
**Body:**
```json
{
  "moisture": 45
}
```
**Validation:**
- `moisture`: integer, 0–100, required
- Invalid: 400 `{ error: "Invalid moisture value. Must be 0-100." }`
- Unauthorized: 401 `{ error: "Unauthorized" }`

**Response:** 200
```json
{ "ok": true, "shouldPump": false }
```

#### `GET /api/command`
**Headers:** `x-api-key: <ARDUINO_API_KEY>`
**Response:** 200
```json
{ "pump": true | false }
```

### Dashboard-Facing (No Auth)

#### `GET /api/latest`
**Response:** 200
```json
{
  "moisture": 45,
  "ts": 1714473600000,
  "pumpStatus": "idle",
  "lastPump": {
    "ts": 1714473500000,
    "trigger": "manual"
  }
}
```
**No data:** 200 `{ "moisture": null, "ts": null, "pumpStatus": "idle", "lastPump": null }`

#### `POST /api/pump`
**Response:** 200
```json
{ "ok": true }
```

#### `POST /api/simulate`
**Body:**
```json
{ "moisture": 45 }
```
**Description:** Dashboard-safe endpoint for the simulator. Does NOT require `x-api-key`. Internally calls the same logic as `POST /api/reading`.
**Response:** 200
```json
{ "ok": true, "shouldPump": false }
```

#### `GET /api/settings`
**Response:** 200
```json
{
  "threshold": 40,
  "intervalMin": 5,
  "pumpSec": 5
}
```

#### `POST /api/settings`
**Body:**
```json
{
  "threshold": 40,
  "intervalMin": 5,
  "pumpSec": 5
}
```
**Validation (clamping):**
- `threshold`: clamped to 0–100
- `intervalMin`: clamped to 1–30
- `pumpSec`: clamped to 1–60
- No 400 errors for out-of-range values — silently corrected
- Completely malformed bodies (non-JSON, missing fields) return 400 `{ error: "Invalid settings values" }`

> **Doc updates:** This PR updates SCHEMA.md, BACKEND.md, and DASHBOARD.md to reflect clamping behavior and the `{ ok, saved }` response shape.

**Response:** 200
```json
{ "ok": true, "saved": { "threshold": 40, "intervalMin": 5, "pumpSec": 5 } }
```

> **Note:** This PR updates BACKEND.md and DASHBOARD.md to match the `{ ok, saved }` response shape.

#### `GET /api/logs`
**Query:** `?page=1&limit=25`
**Response:** 200
```json
{
  "readings": [...],
  "total": 150,
  "page": 1,
  "totalPages": 6
}
```

> **Note:** Pagination envelope (`total`, `page`, `totalPages`) is a spec extension. PRD.md F5 originally specified "last 100 readings"; this spec revises to 25 rows per page with pagination for better UX. This PR will update BACKEND.md, DASHBOARD.md, and PRD.md to match.

---

## 6. Database Schema

### Supabase PostgreSQL

```sql
CREATE TABLE readings (
  id BIGSERIAL PRIMARY KEY,
  moisture INTEGER NOT NULL CHECK (moisture >= 0 AND moisture <= 100),
  pump_fired BOOLEAN DEFAULT false,
  trigger TEXT DEFAULT 'auto' CHECK (trigger IN ('auto', 'manual')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_readings_created_at ON readings(created_at DESC);
```

### Upstash Redis Keys

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `latest` | hash | none | Fields: `moisture` (number), `ts` (timestamp ms) |
| `settings` | hash | none | Fields: `threshold`, `intervalMin`, `pumpSec` |
| `pump_command` | string | 300s | Pending pump command: `"true"` |
| `pump_status` | string | none | Current status: `idle`, `pending`, `running`, `error` *(spec extension — not in original SCHEMA.md)* |

**Pump Status Lifecycle:**
- `idle` → `pending`: Manual trigger or auto-pump fires
- `pending` → `running`: Arduino polls `/api/command` and receives command
- `running` → `idle`: Next `POST /api/reading` from Arduino resets status to `idle`
- `pending` → `error`: Command TTL expires without Arduino pickup (dashboard detects on each poll)

---

## 7. Types

```typescript
// src/lib/types.ts

export interface Reading {
  id: number;
  moisture: number;
  pump_fired: boolean;
  trigger: 'auto' | 'manual';
  created_at: string;
}

export interface LatestReading {
  moisture: number | null;
  ts: number | null;
}

export interface Settings {
  threshold: number;
  intervalMin: number;
  pumpSec: number;
}

export interface PumpCommand {
  pump: boolean;
}

export type PumpStatus = 'idle' | 'pending' | 'running' | 'error';

export interface ApiError {
  error: string;
  details?: string[];
}
```

---

## 8. UI Pages

### `/` — Dashboard Home
- **Layout:** Centered content, max-width 1200px
- **Component type:** Client Component (`'use client'`) — requires `useState`, `useEffect` for polling, simulator interactivity
- **Sections:**
  1. MoistureGauge (hero section, large)
  2. PumpCard (action card below gauge)
  3. SimulatorControls (collapsible section at bottom)
- **Responsive:**
  - Mobile: single column, gauge full width
  - Desktop: gauge left (60%), pump card right (40%) in a 2-column grid

### `/logs` — History
- **Layout:** Full-width table
- **Component type:** Server Component (default) — fetches data via `searchParams`, no interactivity needed
- **Features:** Pagination controls below table (URL-based via `searchParams`)
- **Responsive:**
  - Mobile: card-based list view instead of table
  - Desktop: full table with all columns

### `/settings` — Configuration
- **Layout:** Centered form, max-width 600px
- **Component type:** Client Component (`'use client'`) — requires form state, `useState`, submit handler
- **Sections:**
  1. Threshold slider (with live value display)
  2. Reading interval input (minutes)
  3. Pump duration input (seconds)
  4. Save button
- **Validation:** Inline errors, disabled save until valid

---

## 9. Error Handling

### API Errors
- All routes return typed JSON: `{ error: string, details?: string[] }`
- Never swallow exceptions silently
- HTTP status codes: 400 (validation), 401 (auth), 404 (not found), 500 (server)

### UI Errors
- Toast notifications for mutations (success/error)
- Fallback UI for failed data fetch: "Unable to load data. Retry?"
- Form validation: inline errors, prevent submit until valid

### Edge Cases
- **No readings yet:** Gauge shows "No data", pump card shows "Not connected"
- **Arduino offline >15 min:** Gauge dims, shows "Last seen X min ago" warning
- **Pump command expires:** Dashboard shows "Expired — retry?" button
- **Supabase unavailable:** Dashboard shows error state with retry option
- **Optimistic pump log:** `POST /api/pump` inserts a log entry immediately, but the Arduino may never execute the pump (offline, command expiry). Log entries represent *commands issued*, not necessarily *pumps executed*.

---

## 10. Cost Mitigations

### Redis Rate Limiting
- **Polling interval:** 30 seconds (dashboard) = ~2,880 GETs/day for one user
- **Simulator:** 60-second interval = ~1,440 POSTs/day
- **Total estimated usage:** ~6,000–9,000 commands/day with one active user + simulator (each POST triggers 2–3 Redis ops)
- **Mitigation:**
  - Dashboard polling at 30s per PRD.md F1
  - Simulator defaults to 60s to stay within free tier
  - If multiple users access dashboard, consider bumping polling to 60s
  - **Warning:** Continuous auto-simulator on free tier is tight. Disable auto-simulator for 24/7 deployment; use manual sends instead.

### Data Retention
- **Index:** `created_at DESC` on `readings` table for fast queries
- **MVP:** No automatic deletion (queries stay fast with index)
- **Post-MVP:** pg_cron job to aggregate readings older than 30 days
- **Storage estimate:** ~25MB/year at 1 reading/minute

---

## 11. Implementation Slices

| # | Slice | Files / Routes | Deliverable |
|---|-------|---------------|-------------|
| 1 | **Infrastructure** | `types.ts`, `supabase.ts`, `redis.ts`, `auth.ts`, `services/irrigation-service.ts`, `/api/settings` (GET only), install shadcn comps | Foundation ready for all slices |
| 2 | **Dashboard + Simulator** | `/api/reading` (stores reading + updates `latest`), `/api/latest`, `/page.tsx`, `MoistureGauge`, `SimulatorControls` | Live moisture gauge with auto-updating data |

> **Slice 2 vs Slice 4:** Slice 2's `/api/reading` includes threshold check and auto-pump logic from the start. Slice 4 adds the Settings page and `/api/settings` POST (update), not the threshold logic itself.
| 3 | **Pump Control** | `/api/pump`, `/api/command`, `PumpCard` | Manual pump trigger + Arduino command polling |
| 4 | **Auto-Pump + Settings** | `/api/settings`, `/settings/page.tsx`, `SettingsForm`, threshold logic in `/api/reading` | Auto-trigger when moisture < threshold |
| 5 | **Logs** | `/api/logs` (limit clamped to max 100), `/logs/page.tsx`, `LogsTable` | Full history with pagination |

> **Note:** Next.js 16 may require async `searchParams`. If so, await it before passing to the service.
| 6 | **Polish** | `Nav`, responsive styles, loading skeletons, error states | Production-ready responsive dashboard |

### Slice Dependencies
```
Slice 1 (Infrastructure)
  ├── Slice 2 (Dashboard + Simulator)
  │     └── Slice 3 (Pump Control)
  │           └── Slice 4 (Auto-Pump + Settings)
  ├── Slice 5 (Logs)
  └── Slice 6 (Polish) — runs across all pages
```

**Sequential execution:** 1 → 2 → 3 → 4 → 5 → 6

---

## 12. Testing Strategy

### Manual Testing (Simulator)
- **Slice 2:** Verify gauge updates after simulator posts reading
- **Slice 3:** Trigger pump manually, verify command appears in Redis
- **Slice 4:** Set threshold to 50, send reading of 40, verify auto-pump fires
- **Slice 5:** Verify pagination works with >25 readings
- **Slice 6:** Test on mobile viewport (320px–768px)

### Edge Case Tests
- Send moisture = 0 and moisture = 100
- Rapid pump toggles (double-click manual trigger)
- Arduino offline: stop simulator, wait 15+ min, verify stale UI
- Command expiry: trigger pump, don't poll for 5+ min, verify expired state

### Performance Checks
- Verify Redis command volume stays under 10,000/day during testing (30s polling + 60s sim)
- Check build passes (`pnpm build`) after each slice

---

## 13. Open Questions / Post-MVP

1. **Multi-zone support:** Add `zone_id` to readings, refactor UI to zone grid
2. **User authentication:** Add login/protect dashboard routes
3. **Push notifications:** Alert when Arduino offline or moisture critical
4. **Data aggregation:** Nightly cron to compress old readings into daily averages
5. **Pump scheduling:** Time-based watering schedules (e.g., "water at 6 AM daily")

---

## 14. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Redis free tier exceeded | Low | Medium | 30s polling + 60s simulator; warn users to disable auto-sim for 24/7 |
| Supabase query slowdown | Low | Medium | `created_at` index |
| Arduino command lost | Low | High | 5-min TTL + pending status |
| Mobile UI breaks | Medium | Medium | Test all breakpoints in Slice 6 |
| Build fails (Next.js 16 breaking changes) | Medium | High | Read local docs before writing routes |

---

## Approval

**Approved by:** Hans
**Date:** 2026-04-30
**Next step:** Invoke `writing-plans` skill to create detailed implementation plan
