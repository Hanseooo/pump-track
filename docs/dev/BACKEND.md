# Backend Implementation Guide
## Next.js 16 API Routes

> See SCHEMA.md for full API specification and data shapes.
> See SETUP.md for project creation and environment variable setup.

All API routes are **thin controllers** that delegate business logic to `src/lib/services/irrigation-service.ts`.

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

## Supabase Helpers

File: `src/lib/supabase.ts`

The Supabase client provides helper functions for all database operations:

- `getLatestReading()` — returns the most recent reading row
- `getLastPumpReading()` — returns the most recent reading where `pump_fired = true`
- `getReadings(page, limit)` — paginated readings
- `insertReading(reading)` — inserts a new reading
- `getSettings()` — fetches singleton row from `app_settings`
- `saveSettings(settings)` — upserts singleton row in `app_settings`
- `getAppState()` — fetches singleton row from `app_state`
- `setPumpStatusInDb(status)` — updates `pump_status` in `app_state`
- `setPumpCommandInDb()` — sets `pump_command = 'true'` with 5min expiry in `app_state`
- `deletePumpCommandInDb()` — clears `pump_command` in `app_state`
- `setPumpCommandExpiredInDb()` — clears expired command in `app_state`

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
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, unauthorizedResponse } from '@/lib/auth'
import { recordReading } from '@/lib/services/irrigation-service'

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse()

  try {
    const body = await request.json()
    const moisture = parseInt(body.moisture)

    if (isNaN(moisture) || moisture < 0 || moisture > 100)
      return NextResponse.json({ error: 'Invalid moisture value. Must be 0-100.' }, { status: 400 })

    const { shouldPump } = await recordReading(moisture)
    return NextResponse.json({ ok: true, shouldPump })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

---

### `src/app/api/command/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, unauthorizedResponse } from '@/lib/auth'
import { getPumpCommand, deletePumpCommand, setPumpStatus } from '@/lib/services/irrigation-service'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse()

  try {
    const command = await getPumpCommand()

    if (command) {
      await deletePumpCommand()
      await setPumpStatus('running')
      return NextResponse.json({ pump: true })
    }

    return NextResponse.json({ pump: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

---

### `src/app/api/pump/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { triggerManualPump } from '@/lib/services/irrigation-service'

export async function POST() {
  try {
    await triggerManualPump()
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
```

---

### `src/app/api/latest/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getDashboardData } from '@/lib/services/irrigation-service'

export async function GET() {
  const data = await getDashboardData()
  return NextResponse.json(data)
}
```

---

### `src/app/api/logs/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getReadings } from '@/lib/services/irrigation-service'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)

  try {
    const data = await getReadings(1, limit)
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

---

### `src/app/api/settings/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/lib/services/irrigation-service'
import { Settings } from '@/lib/types'

export async function GET() {
  const settings = await getSettings()
  return NextResponse.json(settings)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const threshold = parseInt(body.threshold, 10)
    const intervalMin = parseInt(body.intervalMin, 10)
    const pumpSec = parseInt(body.pumpSec, 10)
    const commandPollSec = parseInt(body.commandPollSec, 10) || 30

    if (isNaN(threshold) || isNaN(intervalMin) || isNaN(pumpSec))
      return NextResponse.json({ error: 'Invalid settings values' }, { status: 400 })

    const settings: Settings = { threshold, intervalMin, pumpSec, commandPollSec }
    const saved = await saveSettings(settings)
    return NextResponse.json({ ok: true, saved })
  } catch (error) {
    console.error('POST /api/settings error:', error)

    if (error instanceof SyntaxError)
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
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
pnpm dev

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
