# Schema & API Specification

---

## Database Schema

### Supabase — `readings` table

```sql
CREATE TABLE readings (
  id          BIGSERIAL PRIMARY KEY,
  moisture    INTEGER NOT NULL CHECK (moisture >= 0 AND moisture <= 100),
  pump_fired  BOOLEAN DEFAULT false,
  trigger     TEXT DEFAULT 'auto' CHECK (trigger IN ('auto', 'manual')),
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

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
| pump_status | text | CHECK ('idle' | 'pending' | 'running' | 'error') | 'idle' |
| pump_command | text | nullable | null |
| pump_command_expires_at | timestamptz | nullable | null |
| updated_at | timestamptz | | now() |

### Default Settings Values

| Setting | Default | Min | Max |
|---------|---------|-----|-----|
| `threshold` | 40 | 0 | 100 |
| `intervalMin` | 5 | 1 | 30 |
| `pumpSec` | 5 | 1 | 60 |
| `commandPollSec` | 30 | 5 | 300 |

---

## API Specification

All Arduino-facing routes require the header:
```
x-api-key: <ARDUINO_API_KEY>
```

Dashboard routes do not require authentication.

---

### POST `/api/reading`

**Caller:** Arduino (every `intervalMin` minutes)

**Request headers:**
```
Content-Type: application/json
x-api-key: <ARDUINO_API_KEY>
```

**Request body:**
```json
{ "moisture": 28 }
```

**Logic:**
1. Validate API key → 401 if invalid
2. Validate moisture is a number 0–100 → 400 if invalid
3. Fetch `settings` from `app_settings`
4. Determine `shouldPump = moisture < settings.threshold`
5. Insert row into `readings` table with `pump_fired = shouldPump`, `trigger = 'auto'`
6. Update `latest` reading in `readings` table
7. If `shouldPump`, set `pump_command` and `pump_command_expires_at` in `app_state`
8. Return 200

**Response 200:**
```json
{ "ok": true, "shouldPump": true }
```

**Response 401:**
```json
{ "error": "Unauthorized" }
```

**Response 400:**
```json
{ "error": "Invalid moisture value" }
```

---

### GET `/api/command`

**Caller:** Arduino (immediately after each POST /api/reading)

**Request headers:**
```
x-api-key: <ARDUINO_API_KEY>
```

**Logic:**
1. Validate API key → 401 if invalid
2. Check `pump_command` in `app_state`
3. If present and not expired: clear `pump_command`, return `{ pump: true }`
4. Else: return `{ pump: false }`

**Response 200:**
```json
{ "pump": true }
```
or
```json
{ "pump": false }
```

> The command is consumed (deleted) on first read. This prevents the pump from running twice.

---

### POST `/api/pump`

**Caller:** Dashboard (manual "Water Now" button)

**Request body:** none required

**Logic:**
1. Set `pump_command` and `pump_command_expires_at` in `app_state`
2. Query latest row from `readings` table to get current moisture
3. Insert row into `readings` with `pump_fired = true`, `trigger = 'manual'`
4. Return 200

**Response 200:**
```json
{ "ok": true }
```

---

### GET `/api/latest`

**Caller:** Dashboard (polls every 30 seconds)

**Logic:**
1. Query latest row from `readings` table
2. Return values or nulls if no rows exist

**Response 200:**
```json
{ "moisture": 62, "ts": 1718000000000 }
```
or when no data yet:
```json
{ "moisture": null, "ts": null }
```

---

### GET `/api/logs`

**Caller:** Dashboard `/logs` page

**Query params (optional):**
- `limit` — number of rows, default 100, max 500

**Logic:**
1. Query `readings` table ordered by `created_at DESC`, limit rows
2. Return array

**Response 200:**
```json
[
  {
    "id": 42,
    "moisture": 28,
    "pump_fired": true,
    "trigger": "auto",
    "created_at": "2025-01-15T10:30:00Z"
  }
]
```

---

### GET `/api/settings`

**Caller:** Arduino (on startup) + Dashboard `/settings` page

**Logic:**
1. Fetch row from `app_settings`
2. Return with defaults if keys are missing

**Response 200:**
```json
{
  "threshold": 40,
  "intervalMin": 5,
  "pumpSec": 5,
  "commandPollSec": 30
}
```

---

### POST `/api/settings`

**Caller:** Dashboard `/settings` page

**Request body:**
```json
{
  "threshold": 35,
  "intervalMin": 10,
  "pumpSec": 8,
  "commandPollSec": 60
}
```

**Logic:**
1. Parse and clamp each value to its valid range
2. Upsert row in `app_settings`
3. Return saved values

**Response 200:**
```json
{ "ok": true, "saved": { "threshold": 35, "intervalMin": 10, "pumpSec": 8, "commandPollSec": 60 } }
```

**Response 400:**
```json
{ "error": "Invalid settings values" }
```

---

## Arduino ↔ API Flow

```
Every intervalMin minutes:
  Arduino
    → POST /api/reading   { moisture: N }
    ← { ok: true, shouldPump: bool }
    → GET  /api/command
    ← { pump: true|false }
    if pump: run pump for pumpSec seconds

On startup:
  Arduino
    → GET  /api/settings
    ← { threshold, intervalMin, pumpSec }

Manual trigger from dashboard:
  User clicks "Water Now"
    → POST /api/pump
    ← { ok: true }
  On next Arduino poll:
    → GET  /api/command
    ← { pump: true }
    Arduino runs pump
```

---

## Validation Rules

| Field | Type | Constraint |
|-------|------|-----------|
| `moisture` | integer | 0 ≤ n ≤ 100 |
| `threshold` | integer | 0 ≤ n ≤ 100 |
| `intervalMin` | integer | 1 ≤ n ≤ 30 |
| `pumpSec` | integer | 1 ≤ n ≤ 60 |
| `commandPollSec` | integer | 5 ≤ n ≤ 300 |
| `trigger` | string | `'auto'` or `'manual'` |
