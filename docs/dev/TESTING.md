# IoT Irrigation Dashboard — Local Testing Guide

**Last updated:** 2026-04-30
**Scope:** Part 1 (Infrastructure, Dashboard + Simulator, Pump Control)

---

## 1. Prerequisites

### 1.1 Environment Variables

Create `.env.local` in the project root with real values for all five keys:

```env
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_ANON_KEY=your_anon_key
ARDUINO_API_KEY=choose_any_secret_string
KV_REST_API_URL=https://your-redis-url.upstash.io
KV_REST_API_TOKEN=your_redis_token
```

| Variable | Source | Purpose |
|----------|--------|---------|
| `SUPABASE_URL` | Supabase Project Settings → API | PostgreSQL connection |
| `SUPABASE_ANON_KEY` | Supabase Project Settings → API | Auth token for DB client |
| `ARDUINO_API_KEY` | Choose any secure string | Auth for Arduino-facing routes |
| `KV_REST_API_URL` | Upstash Redis Console → REST API | Redis endpoint |
| `KV_REST_API_TOKEN` | Upstash Redis Console → REST API | Redis auth token |

> **Note:** If any key is missing, the dev server and API routes will crash on startup.

### 1.2 Database Setup (Supabase)

Run this SQL in the Supabase SQL Editor to create the `readings` table:

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

### 1.3 Install Dependencies

```bash
pnpm install
```

---

## 2. Start the Dev Server

```bash
pnpm dev
```

Open http://localhost:3000

---

## 3. API Endpoint Tests (curl)

### 3.1 GET /api/settings

**Test:**
```bash
curl http://localhost:3000/api/settings
```

**Expected:**
```json
{ "threshold": 40, "intervalMin": 5, "pumpSec": 5 }
```

> Returns defaults on first run since Redis `settings` hash is empty.

---

### 3.2 POST /api/simulate (Dashboard Simulator)

**Test — normal reading:**
```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"moisture": 60}'
```

**Expected:**
```json
{ "ok": true, "shouldPump": false }
```

**Test — dry soil (below threshold):**
```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"moisture": 30}'
```

**Expected:**
```json
{ "ok": true, "shouldPump": true }
```

> **Important:** `simulate: true` means `pump_command` is **NOT** written to Redis. Use this for safe dashboard testing.

**Test — invalid input:**
```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"moisture": 150}'
```

**Expected:** `400`
```json
{ "error": "Invalid moisture value. Must be 0-100." }
```

---

### 3.3 GET /api/latest

**Test (after sending at least one reading):**
```bash
curl http://localhost:3000/api/latest
```

**Expected:**
```json
{
  "moisture": 60,
  "ts": 1714473600000,
  "pumpStatus": "idle",
  "lastPump": null
}
```

| Field | Meaning |
|-------|---------|
| `moisture` | Latest reading from Redis |
| `ts` | Timestamp (ms) when reading was received |
| `pumpStatus` | `idle`, `pending`, `running`, or `error` |
| `lastPump` | Most recent `pump_fired=true` reading from Supabase |

---

### 3.4 POST /api/reading (Arduino — Auth Required)

**Test — unauthorized (no key):**
```bash
curl -X POST http://localhost:3000/api/reading \
  -H "Content-Type: application/json" \
  -d '{"moisture": 50}'
```

**Expected:** `401`
```json
{ "error": "Unauthorized" }
```

**Test — authorized:**
```bash
curl -X POST http://localhost:3000/api/reading \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ARDUINO_API_KEY" \
  -d '{"moisture": 50}'
```

**Expected:**
```json
{ "ok": true, "shouldPump": false }
```

> **Difference from `/api/simulate`:** When `shouldPump` is true, this creates a `pump_command` in Redis (real pump trigger).

---

### 3.5 POST /api/pump (Manual Trigger)

**Test — error case (no readings yet):**
```bash
curl -X POST http://localhost:3000/api/pump
```

**Expected:** `400`
```json
{ "error": "No moisture reading available. Wait for first reading." }
```

**Test — success (send a reading first):**
```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"moisture": 55}'

curl -X POST http://localhost:3000/api/pump
```

**Expected:**
```json
{ "ok": true }
```

After triggering, verify status changed:
```bash
curl http://localhost:3000/api/latest
```

**Expected:** `pumpStatus: "pending"`

---

### 3.6 GET /api/command (Arduino Poll — Auth Required)

**Test — no command:**
```bash
curl http://localhost:3000/api/command \
  -H "x-api-key: $ARDUINO_API_KEY"
```

**Expected:**
```json
{ "pump": false }
```

**Test — command present (trigger pump first, then poll):**
```bash
curl -X POST http://localhost:3000/api/pump
curl http://localhost:3000/api/command \
  -H "x-api-key: $ARDUINO_API_KEY"
```

**Expected first poll:**
```json
{ "pump": true }
```

**Expected second poll (command consumed):**
```json
{ "pump": false }
```

After first poll, verify status:
```bash
curl http://localhost:3000/api/latest
```

**Expected:** `pumpStatus: "running"`

---

## 4. Dashboard UI Tests

### 4.1 Initial Load

1. Open http://localhost:3000
2. **Expected:** Gauge shows "--" with "No data yet. Use simulator to send a reading."
3. **Expected:** Pump Card shows "Waiting for first reading..." (button disabled)

### 4.2 Simulator

1. Click **Random** in Simulator section
2. **Expected:** Gauge updates with a random value (0–100)
3. **Expected:** Color changes:
   - Green if moisture >= threshold (default 40)
   - Red if moisture < threshold
4. Send moisture = `20` (below threshold)
5. **Expected:** `POST /api/simulate` returns `{ shouldPump: true }`

### 4.3 Pump Trigger Flow

1. Send a reading (so `latest` exists in Redis)
2. Click **Trigger Pump** → Confirm dialog appears
3. Click **Confirm**
4. **Expected:** Toast shows "Pump triggered"
5. **Expected:** Pump Card badge changes to `pending` (yellow)
6. Poll `/api/command` with Arduino key
7. **Expected:** Returns `{ pump: true }`
8. Check dashboard again
9. **Expected:** Pump Card badge changes to `running` (green)
10. Send another reading via simulator
11. **Expected:** Pump Card badge returns to `idle` (gray)

### 4.4 Stale Data Warning

1. Send a reading
2. Wait 15+ minutes without sending new readings (or manually set `ts` in Redis to >15 min ago)
3. **Expected:** Gauge dims and shows "Last seen X min ago" warning badge

### 4.5 Command Expiry

1. Trigger pump manually
2. Wait 5+ minutes without Arduino polling `/api/command`
3. **Expected:** Pump Card badge changes to `error` (red)
4. **Expected:** Message shows "Pump command expired. Please try again."

---

## 5. Edge Case Tests

| Case | Steps | Expected Result |
|------|-------|-----------------|
| Moisture = 0 | Send `{"moisture": 0}` | Gauge shows 0%, red, `shouldPump: true` |
| Moisture = 100 | Send `{"moisture": 100}` | Gauge shows 100%, green, `shouldPump: false` |
| Invalid moisture | Send `{"moisture": -5}` or `{"moisture": 101}` | `400` error |
| Double pump trigger | Click "Trigger Pump" twice rapidly | Second request should also succeed (new command set) |
| No auth on Arduino routes | Call `/api/reading` or `/api/command` without `x-api-key` | `401 Unauthorized` |

---

## 6. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `supabaseUrl is required` error | Missing `SUPABASE_URL` or `SUPABASE_ANON_KEY` | Check `.env.local` |
| Upstash Redis `url` missing warnings | Missing `KV_REST_API_URL` or `KV_REST_API_TOKEN` | Check `.env.local` |
| `No moisture reading available` | Redis `latest` hash is empty | Send a reading via simulator first |
| Pump status stuck in `pending` | Arduino hasn't polled `/api/command` yet | Poll with curl or wait for expiry |
| Dashboard shows stale warning | Last reading >15 min ago | Send a new reading |
| `401 Unauthorized` | Wrong or missing `x-api-key` header | Match header value to `ARDUINO_API_KEY` env var |

---

## 7. Verification Checklist

Before declaring Part 1 complete, verify:

- [ ] `pnpm build` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] `GET /api/settings` returns default settings
- [ ] `POST /api/simulate` stores readings and updates gauge
- [ ] `POST /api/reading` with `x-api-key` works and respects threshold
- [ ] `GET /api/latest` returns moisture, ts, pumpStatus, lastPump
- [ ] `POST /api/pump` triggers manual pump (after first reading exists)
- [ ] `GET /api/command` with `x-api-key` returns `{ pump: true }` then `{ pump: false }`
- [ ] Pump status transitions: `idle` → `pending` → `running` → `idle`
- [ ] Dashboard gauge shows correct colors based on threshold
- [ ] Stale warning appears after 15+ min of no data
- [ ] No `.env.local` or secrets committed to git
