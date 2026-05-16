# PumpTrack

IoT irrigation dashboard for a single-plant Arduino-based watering system. Monitor soil moisture, trigger watering manually, configure auto-watering threshold, and review watering history — all from a web browser.

## Features

- **Live Moisture Display** — Color-coded soil moisture gauge, auto-refreshes every 30s
- **Manual Watering** — "Water Now" button to trigger the pump on demand
- **Auto-Watering** — Arduino triggers watering when moisture drops below threshold
- **Watering Logs** — History table of the last 100 readings (moisture %, pump fired, trigger type, timestamp)
- **Settings** — Configurable threshold (0–100%), reading interval (1–30 min), pump duration (1–60 s)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Cache / KV | Upstash Redis |
| Hosting | Vercel |
| IoT | Arduino UNO R4 WiFi |

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Dashboard (/)
│   ├── logs/page.tsx         # Watering logs
│   ├── settings/page.tsx    # Settings
│   └── api/                 # Thin controller routes
│       ├── reading/         # POST — Arduino submits reading
│       ├── command/         # GET  — Arduino polls pump command
│       ├── pump/           # POST — Manual trigger
│       ├── latest/          # GET  — Latest moisture
│       ├── logs/            # GET  — History
│       └── settings/        # GET/POST — Settings
├── lib/
│   ├── services/            # Business logic (layered architecture)
│   ├── supabase.ts         # Supabase client singleton
│   └── types.ts            # Shared TypeScript types
└── components/             # shadcn/ui + custom components
```

See [docs/dev/modularity.md](docs/dev/modularity.md) for architecture rules.

## Setup

### 1. Create the Next.js App

```bash
npx create-next-app@latest pump-track --typescript --tailwind --app --src-dir --import-alias "@/*"
cd pump-track
```

### 2. Install Dependencies

```bash
npm install @upstash/redis @supabase/supabase-js
npx shadcn@latest init
# choose: Default style, Slate base, Yes to CSS variables
npx shadcn@latest add button card badge table progress input label separator
```

### 3. Configure Environment Variables

Create `.env.local` in the project root (never commit this file):

```env
SUPABASE_URL= https://yourproject.supabase.co
SUPABASE_ANON_KEY=your_anon_key
ARDUINO_API_KEY=your_secret_key_here
```

Add all variables to **Vercel dashboard → Settings → Environment Variables**.

### 4. Deploy to Vercel

```bash
git add .
git commit -m "feat: initial pump-track setup"
git push
```

Vercel auto-deploys on every push to `main`. Connect Upstash Redis and Supabase in the Vercel dashboard.

## Companion Arduino Firmware

The Arduino UNO R4 WiFi firmware is maintained separately:

> **https://github.com/Hanseooo?tab=repositories** — source code + wiring diagram

Flash `secrets.example.h` → `secrets.h` with your values:

- `WIFI_SSID`, `WIFI_PASSWORD`
- `API_HOST` (your Vercel domain, without `https://`)
- `API_KEY` (same as `ARDUINO_API_KEY` in `.env.local`)

## API Endpoints

| Method | Route | Caller | Description |
|--------|-------|--------|-------------| 
| POST | `/api/reading` | Arduino | Submit moisture reading |
| GET | `/api/command` | Arduino | Poll for pump command |
| POST | `/api/pump` | Dashboard | Manual pump trigger |
| GET | `/api/latest` | Dashboard | Latest moisture + timestamp |
| GET | `/api/logs` | Dashboard | Last 100 readings |
| GET | `/api/settings` | All | Get current settings |
| POST | `/api/settings` | Dashboard | Update settings |

All endpoints return JSON. See [docs/dev/SCHEMA.md](docs/dev/SCHEMA.md) for request/response shapes.

## Documentation

| File | Description |
|------|-------------| 
| `docs/dev/PRD.md` | Product requirements, features, data model |
| `docs/dev/SETUP.md` | Full setup guide |
| `docs/dev/SCHEMA.md` | Database schema, API spec, TypeScript types |
| `docs/dev/BACKEND.md` | API route implementations |
| `docs/dev/DASHBOARD.md` | Page/component implementations |
| `docs/dev/modularity.md` | Architecture rules |
