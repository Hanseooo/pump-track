# Project Setup Guide
## irrigation-dashboard — Next.js 16 + Supabase

---

## Prerequisites

- Node.js 20+
- pnpm
- A Supabase account (supabase.com)
- A GitHub account (for Vercel deployment)

---

## 1. Create the Next.js App

```bash
npx create-next-app@latest irrigation-dashboard \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

cd irrigation-dashboard
```

When prompted, select **Yes** to use the App Router.

---

## 2. Install Dependencies

```bash
pnpm install @supabase/supabase-js
npx shadcn@latest init
```

When shadcn asks:
- Style: **Default**
- Base color: **Slate**
- CSS variables: **Yes**

Install the shadcn components used in this project:
```bash
npx shadcn@latest add button card badge table progress input label separator
```

---

## 3. Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New Project → name it `irrigation`
2. Go to **SQL Editor** and run:

```sql
CREATE TABLE readings (
  id          BIGSERIAL PRIMARY KEY,
  moisture    INTEGER NOT NULL,
  pump_fired  BOOLEAN DEFAULT false,
  trigger     TEXT DEFAULT 'auto',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Singleton settings table
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  threshold INTEGER NOT NULL DEFAULT 40 CHECK (threshold BETWEEN 0 AND 100),
  interval_min INTEGER NOT NULL DEFAULT 5 CHECK (interval_min BETWEEN 1 AND 30),
  pump_sec INTEGER NOT NULL DEFAULT 5 CHECK (pump_sec BETWEEN 1 AND 60),
  command_poll_sec INTEGER NOT NULL DEFAULT 30 CHECK (command_poll_sec BETWEEN 5 AND 300),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Singleton state table
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pump_status TEXT DEFAULT 'idle' CHECK (pump_status IN ('idle', 'pending', 'running', 'error')),
  pump_command TEXT,
  pump_command_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE app_state;
ALTER PUBLICATION supabase_realtime ADD TABLE readings;
```

3. Go to **Project Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - anon/public key → `SUPABASE_ANON_KEY`

---

## 4. Environment Variables

Create `.env.local` in the project root:

```env
# Supabase
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# Arduino auth (generate any random string)
ARDUINO_API_KEY=your_secret_key_here
```

> **Never commit `.env.local` to Git.** Ensure `.env.local` is in `.gitignore`.

Generate `ARDUINO_API_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Also add all variables to **Vercel dashboard → Settings → Environment Variables**.

---

## 5. Folder Structure

```
irrigation-dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx              ← Root layout
│   │   ├── page.tsx                ← Dashboard (/)
│   │   ├── logs/
│   │   │   └── page.tsx            ← Logs (/logs)
│   │   ├── settings/
│   │   │   └── page.tsx            ← Settings (/settings)
│   │   └── api/
│   │       ├── reading/
│   │       │   └── route.ts        ← POST /api/reading
│   │       ├── command/
│   │       │   └── route.ts        ← GET /api/command
│   │       ├── pump/
│   │       │   └── route.ts        ← POST /api/pump
│   │       ├── latest/
│   │       │   └── route.ts        ← GET /api/latest
│   │       ├── logs/
│   │       │   └── route.ts        ← GET /api/logs
│   │       └── settings/
│   │           └── route.ts        ← GET + POST /api/settings
│   ├── lib/
│   │   ├── supabase.ts             ← Supabase client + helpers
│   │   ├── types.ts                ← TypeScript types
│   │   ├── auth.ts                 ← API key validation
│   │   └── services/
│   │       └── irrigation-service.ts ← Business logic layer
│   └── components/
│       ├── moisture-gauge.tsx      ← Moisture % display + progress bar
│       ├── pump-card.tsx           ← Pump status + water now button
│       └── nav.tsx                 ← Simple nav links
├── .env.local                      ← Secret keys (gitignored)
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## 6. Supabase Client (`src/lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL) throw new Error('Missing SUPABASE_URL')
if (!process.env.SUPABASE_ANON_KEY) throw new Error('Missing SUPABASE_ANON_KEY')

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
```

---

## 7. TypeScript Types (`src/lib/types.ts`)

```typescript
export type Reading = {
  id: number
  moisture: number
  pump_fired: boolean
  trigger: 'auto' | 'manual'
  created_at: string
}

export type Settings = {
  threshold: number       // 0-100, default 40
  intervalMin: number     // 1-30, default 5
  pumpSec: number         // 1-60, default 5
  commandPollSec: number  // 5-300, default 30
}

export type LatestReading = {
  moisture: number | null
  ts: number | null    // unix timestamp ms
}
```

---

## 8. Local Development

```bash
pnpm dev
```

App runs at `http://localhost:3000`.

To test API routes locally before the Arduino is ready, use curl:
```bash
# Simulate Arduino posting a reading
curl -X POST http://localhost:3000/api/reading \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_secret_key_here" \
  -d '{"moisture": 28}'

# Check what command the Arduino would receive
curl http://localhost:3000/api/command \
  -H "x-api-key: your_secret_key_here"
```

---

## 9. Deploy to Vercel

```bash
git add .
git commit -m "initial setup"
git push
```

Vercel auto-deploys on every push to `main`. Your live URL will be:
`https://irrigation-dashboard.vercel.app`

Use this URL as `API_HOST` in the Arduino `secrets.h` file (without `https://`).

---

## Next.js 16 Notes

- **No `middleware.ts`** — Next.js 16 replaced it with `proxy.ts`. This project does not need either.
- **Caching is opt-in** — API routes run dynamically by default. No extra config needed.
- **Turbopack is default** — `pnpm dev` uses Turbopack automatically. No config needed.
- **App Router only** — Do not create a `pages/` directory.
