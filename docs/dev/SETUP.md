# Project Setup Guide
## irrigation-dashboard — Next.js 16 + Supabase + Upstash Redis

---

## Prerequisites

- Node.js 20+
- npm / pnpm / bun
- A Supabase account (supabase.com)
- A Vercel account (vercel.com)
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
npm install @upstash/redis @supabase/supabase-js
npm install -D @types/node
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
```

3. Go to **Project Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - anon/public key → `SUPABASE_ANON_KEY`

---

## 4. Upstash Redis Setup

1. Push your repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. In Vercel dashboard → **Storage → Create → Connect Redis** (Upstash)
4. Name it `irrigation-kv` and connect to your project
5. Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   *Note: Vercel KV was deprecated — now using Upstash Redis directly.*

---

## 5. Environment Variables

Create `.env.local` in the project root:

```env
# Supabase
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# Arduino auth (generate any random string)
ARDUINO_API_KEY=your_secret_key_here

# Upstash Redis (auto-filled after connecting Redis in Vercel dashboard)
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

> **Never commit `.env.local` to Git.** Ensure `.env.local` is in `.gitignore`.

Generate `ARDUINO_API_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Also add all variables to **Vercel dashboard → Settings → Environment Variables**.

---

## 6. Folder Structure

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
│   │   ├── supabase.ts             ← Supabase client singleton
│   │   └── kv.ts                   ← KV helper types
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

## 7. Supabase Client (`src/lib/supabase.ts`)

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

## 8. TypeScript Types (`src/lib/types.ts`)

```typescript
export type Reading = {
  id: number
  moisture: number
  pump_fired: boolean
  trigger: 'auto' | 'manual'
  created_at: string
}

export type Settings = {
  threshold: number    // 0-100, default 40
  intervalMin: number  // 1-30, default 5
  pumpSec: number      // 1-60, default 5
}

export type LatestReading = {
  moisture: number | null
  ts: number | null    // unix timestamp ms
}
```

---

## 9. Local Development

```bash
npm run dev
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

## 10. Deploy to Vercel

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
- **Turbopack is default** — `npm run dev` uses Turbopack automatically. No config needed.
- **App Router only** — Do not create a `pages/` directory.
