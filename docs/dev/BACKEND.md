# Backend Implementation Guide
## Next.js 16 API Routes

> See SCHEMA.md for full API specification and data shapes.
> See SETUP.md for project creation and environment variable setup.

---

## Supabase Client

File: `src/lib/supabase.ts`

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

## Auth Helper

File: `src/lib/auth.ts`

```typescript
export function validateApiKey(req: Request): boolean {
  return req.headers.get('x-api-key') === process.env.ARDUINO_API_KEY
}
```

---

## API Route Implementations

### `src/app/api/reading/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { kv } from '@upstash/redis'
import { supabase } from '@/lib/supabase'
import { validateApiKey } from '@/lib/auth'
import type { Settings } from '@/lib/types'

export async function POST(req: NextRequest) {
  if (!validateApiKey(req))
    return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const moisture = parseInt(body.moisture)

  if (isNaN(moisture) || moisture < 0 || moisture > 100)
    return Response.json({ error: 'Invalid moisture value' }, { status: 400 })

  const raw = await kv.hgetall<Settings>('settings')
  const threshold = raw?.threshold ?? 40

  const shouldPump = moisture < threshold

  await supabase.from('readings').insert({
    moisture,
    pump_fired: shouldPump,
    trigger: 'auto',
  })

  await kv.hset('latest', { moisture, ts: Date.now() })

  if (shouldPump) {
    await kv.set('pump_command', 'true', { ex: 300 })
  }

  return Response.json({ ok: true, shouldPump })
}
```

---

### `src/app/api/command/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { kv } from '@upstash/redis'
import { validateApiKey } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!validateApiKey(req))
    return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const command = await kv.get<string>('pump_command')

  if (command === 'true') {
    await kv.del('pump_command')
    return Response.json({ pump: true })
  }

  return Response.json({ pump: false })
}
```

---

### `src/app/api/pump/route.ts`

```typescript
import { kv } from '@upstash/redis'
import { supabase } from '@/lib/supabase'
import type { LatestReading } from '@/lib/types'

export async function POST() {
  await kv.set('pump_command', 'true', { ex: 300 })

  const latest = await kv.hgetall<LatestReading>('latest')

  await supabase.from('readings').insert({
    moisture: latest?.moisture ?? null,
    pump_fired: true,
    trigger: 'manual',
  })

  return Response.json({ ok: true })
}
```

---

### `src/app/api/latest/route.ts`

```typescript
import { kv } from '@upstash/redis'
import type { LatestReading } from '@/lib/types'

export async function GET() {
  const latest = await kv.hgetall<LatestReading>('latest')
  return Response.json(latest ?? { moisture: null, ts: null })
}
```

---

### `src/app/api/logs/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)

  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(data ?? [])
}
```

---

### `src/app/api/settings/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { kv } from '@upstash/redis'
import type { Settings } from '@/lib/types'

const DEFAULTS: Settings = { threshold: 40, intervalMin: 5, pumpSec: 5 }

export async function GET() {
  const raw = await kv.hgetall<Settings>('settings')
  return Response.json({
    threshold:   raw?.threshold   ?? DEFAULTS.threshold,
    intervalMin: raw?.intervalMin ?? DEFAULTS.intervalMin,
    pumpSec:     raw?.pumpSec     ?? DEFAULTS.pumpSec,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const threshold   = Math.max(0,  Math.min(100, parseInt(body.threshold   ?? DEFAULTS.threshold)))
  const intervalMin = Math.max(1,  Math.min(30,  parseInt(body.intervalMin ?? DEFAULTS.intervalMin)))
  const pumpSec     = Math.max(1,  Math.min(60,  parseInt(body.pumpSec     ?? DEFAULTS.pumpSec)))

  if (isNaN(threshold) || isNaN(intervalMin) || isNaN(pumpSec))
    return Response.json({ error: 'Invalid settings values' }, { status: 400 })

  const saved: Settings = { threshold, intervalMin, pumpSec }
  await kv.hset('settings', saved)

  return Response.json({ ok: true, saved })
}
```

---

## Error Handling Pattern

Always return typed JSON responses. Never let routes throw uncaught errors in production.

```typescript
try {
  // ... route logic
} catch (err) {
  console.error(err)
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}
```

---

## Testing Routes Locally

```bash
# Start dev server
npm run dev

# POST a reading (simulates Arduino)
curl -X POST http://localhost:3000/api/reading \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_key_here" \
  -d '{"moisture": 25}'

# Check command
curl http://localhost:3000/api/command \
  -H "x-api-key: your_key_here"

# Manual pump trigger
curl -X POST http://localhost:3000/api/pump

# Get latest reading
curl http://localhost:3000/api/latest

# Get logs
curl http://localhost:3000/api/logs

# Get settings
curl http://localhost:3000/api/settings

# Update settings
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"threshold": 35, "intervalMin": 10, "pumpSec": 8}'
```
