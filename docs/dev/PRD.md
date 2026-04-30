# Product Requirements Document
## IoT Smart Irrigation System — Dashboard & API

---

## Overview

A web-based monitoring and control dashboard for a single-plant Arduino-based irrigation system. The Arduino UNO R4 WiFi reads soil moisture, controls a 5V water pump via relay, and communicates with a Next.js backend hosted on Vercel. The dashboard provides real-time monitoring, manual control, historical logs, and configurable auto-watering settings.

---

## Goals

- Give the user visibility into soil moisture levels without being physically present
- Allow the user to manually trigger watering from any device with a browser
- Automate watering when moisture drops below a configurable threshold
- Log all watering events for review and reporting
- Keep the system simple enough to demo and explain as a school project

---

## Non-Goals

- Multi-user authentication or accounts
- Multi-plant / multi-zone support
- Mobile app (responsive web is sufficient)
- Offline/local mode
- Real-time WebSocket streaming (polling is acceptable)

---

## Users

Single user (the student / project owner). No authentication required for the dashboard since it is a school demo hosted on a non-public URL. The Arduino uses an API key to authenticate with the backend.

---

## Features

### F1 — Live Moisture Display
- Show the current soil moisture percentage (0–100%)
- Color-coded: green (≥ threshold), red (< threshold)
- Progress bar visualization
- Show timestamp of last reading
- Auto-refreshes every 30 seconds

### F2 — Pump Status
- Show whether the pump has been queued/triggered
- Display the dry threshold currently configured
- Show time of last watering event

### F3 — Manual Pump Trigger
- "Water Now" button on the dashboard
- Posts a pump command to the API
- Arduino picks up the command on its next poll cycle
- Button shows loading/queued state after click

### F4 — Auto-Watering
- Arduino automatically requests watering when moisture < threshold
- Threshold is configurable via the Settings page
- Auto-watering is logged with trigger type = "auto"

### F5 — Watering Logs
- Table showing last 100 readings
- Columns: timestamp, moisture %, pump fired (yes/no), trigger type (auto/manual)
- Newest entries first

### F6 — Settings
- Dry threshold (0–100%, default 40%)
- Reading interval (1–30 minutes, default 5 minutes)
- Pump duration (1–60 seconds, default 5 seconds)
- Settings saved to Vercel KV, fetched by Arduino on startup and each reading

---

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Main view: moisture gauge, pump status, water now button |
| `/logs` | Logs | Watering history table |
| `/settings` | Settings | Threshold, interval, pump duration controls |

---

## API Endpoints

| Method | Route | Caller | Purpose |
|--------|-------|--------|---------|
| POST | `/api/reading` | Arduino | Submit moisture reading, trigger auto-water check |
| GET | `/api/command` | Arduino | Poll for pending pump command |
| POST | `/api/pump` | Dashboard | Manual pump trigger |
| GET | `/api/latest` | Dashboard | Get latest moisture reading + timestamp |
| GET | `/api/logs` | Dashboard | Get last 100 readings from Supabase |
| GET | `/api/settings` | Arduino + Dashboard | Get current settings |
| POST | `/api/settings` | Dashboard | Update settings |

---

## Data Model

### Supabase — `readings` table
```sql
CREATE TABLE readings (
  id          BIGSERIAL PRIMARY KEY,
  moisture    INTEGER NOT NULL,         -- 0-100 percent
  pump_fired  BOOLEAN DEFAULT false,
  trigger     TEXT DEFAULT 'auto',      -- 'auto' | 'manual'
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### Vercel KV — keys
| Key | Type | Value |
|-----|------|-------|
| `settings` | Hash | `{ threshold, intervalMin, pumpSec }` |
| `latest` | Hash | `{ moisture, ts }` |
| `pump_command` | String | `'true'` (expires 5 min) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Cache / KV | Vercel KV (Redis) |
| Hosting | Vercel |
| Arduino comms | HTTPS POST/GET with API key header |

---

## Constraints

- Arduino only supports HTTP/HTTPS — no WebSockets
- Arduino polls on a fixed interval — commands are queued, not pushed
- Vercel free tier: 100GB bandwidth, 100 hours compute — sufficient for school project
- Supabase free tier: 500MB database, 2GB bandwidth — sufficient
- No authentication on the dashboard (API key protects Arduino endpoints only)
