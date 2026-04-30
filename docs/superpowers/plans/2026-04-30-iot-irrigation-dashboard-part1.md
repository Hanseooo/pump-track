# IoT Irrigation Dashboard — Implementation Plan Part 1

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational infrastructure, live moisture dashboard with simulator, and manual pump control for a single-zone IoT irrigation system.

**Architecture:** Next.js 16 App Router with TypeScript. Supabase PostgreSQL for readings history, Upstash Redis for settings/latest/command state. Service layer in `src/lib/services/` keeps API routes thin. shadcn/ui components for UI.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase, Upstash Redis, pnpm

**Prerequisites:**
- Read `docs/dev/PRD.md`, `docs/dev/SCHEMA.md`, `docs/dev/BACKEND.md`, `docs/dev/DASHBOARD.md`, `docs/dev/modularity.md`
- Read `docs/superpowers/specs/2026-04-30-iot-irrigation-dashboard-design.md`
- Ensure `.env.local` has `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ARDUINO_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`

---

## Chunk 1: Infrastructure

### Task 1.1: Install shadcn/ui Components

**Files:**
- Modify: `package.json` (indirectly via shadcn CLI)

- [ ] **Step 1: Install required shadcn components**

Run:
```bash
npx shadcn@latest add card badge progress table input label separator sheet slider dialog sonner
```

Expected: All components installed to `src/components/ui/`

- [ ] **Step 2: Verify installations**

Run:
```bash
ls src/components/ui/
```

Expected: `button.tsx`, `card.tsx`, `badge.tsx`, `progress.tsx`, `table.tsx`, `input.tsx`, `label.tsx`, `separator.tsx`, `sheet.tsx`, `slider.tsx`, `dialog.tsx`, `sonner.tsx` all present

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/
git commit -m "feat(ui): install shadcn components for dashboard"
```

---

### Task 1.2: Create Type Definitions

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Write types file**

```typescript
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
  pumpStatus: PumpStatus;
  lastPump: { ts: number; trigger: 'auto' | 'manual' } | null;
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

export interface LogsResponse {
  readings: Reading[];
  total: number;
  page: number;
  totalPages: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add irrigation domain types"
```

---

### Task 1.3: Create Supabase Client

**Files:**
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Write Supabase client**

```typescript
import { createClient } from '@supabase/supabase-js';
import { Reading } from './types';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function getLatestReading(): Promise<Reading | null> {
  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as Reading;
}

export async function getLastPumpReading(): Promise<Reading | null> {
  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .eq('pump_fired', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as Reading;
}

export async function getReadings(page: number, limit: number): Promise<{ readings: Reading[]; total: number }> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('readings')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { readings: (data || []) as Reading[], total: count || 0 };
}

export async function insertReading(reading: Omit<Reading, 'id' | 'created_at'>): Promise<Reading> {
  const { data, error } = await supabase
    .from('readings')
    .insert(reading)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Reading;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat(db): add Supabase client and reading helpers"
```

---

### Task 1.4: Create Redis Client

**Files:**
- Create: `src/lib/redis.ts`

- [ ] **Step 1: Write Redis client**

```typescript
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/redis.ts
git commit -m "feat(redis): add Upstash Redis client"
```

---

### Task 1.5: Create Auth Helper

**Files:**
- Create: `src/lib/auth.ts`

- [ ] **Step 1: Write auth helper**

```typescript
import { NextRequest } from 'next/server';

export function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === process.env.ARDUINO_API_KEY;
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): add Arduino API key validation helper"
```

---

### Task 1.6: Create Irrigation Service

**Files:**
- Create: `src/lib/services/irrigation-service.ts`

- [ ] **Step 1: Write irrigation service**

```typescript
import { redis } from '../redis';
import { supabase, insertReading, getLastPumpReading } from '../supabase';
import { Reading, Settings, PumpStatus } from '../types';

const DEFAULT_SETTINGS: Settings = {
  threshold: 40,
  intervalMin: 5,
  pumpSec: 5,
};

export async function getSettings(): Promise<Settings> {
  const settings = await redis.hgetall<Record<string, string>>('settings');
  if (!settings || Object.keys(settings).length === 0) {
    return DEFAULT_SETTINGS;
  }
  return {
    threshold: parseInt(settings.threshold) || DEFAULT_SETTINGS.threshold,
    intervalMin: parseInt(settings.intervalMin) || DEFAULT_SETTINGS.intervalMin,
    pumpSec: parseInt(settings.pumpSec) || DEFAULT_SETTINGS.pumpSec,
  };
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const clamped = {
    threshold: Math.max(0, Math.min(100, settings.threshold)),
    intervalMin: Math.max(1, Math.min(30, settings.intervalMin)),
    pumpSec: Math.max(1, Math.min(60, settings.pumpSec)),
  };
  await redis.hset('settings', clamped);
  return clamped;
}

export async function getLatestFromRedis(): Promise<{ moisture: number | null; ts: number | null }> {
  const latest = await redis.hgetall<Record<string, string>>('latest');
  if (!latest || Object.keys(latest).length === 0) {
    return { moisture: null, ts: null };
  }
  return {
    moisture: latest.moisture ? parseInt(latest.moisture) : null,
    ts: latest.ts ? parseInt(latest.ts) : null,
  };
}

export async function updateLatest(moisture: number): Promise<void> {
  await redis.hset('latest', {
    moisture: moisture.toString(),
    ts: Date.now().toString(),
  });
}

export async function getPumpStatus(): Promise<PumpStatus> {
  const status = await redis.get<string>('pump_status');
  return (status as PumpStatus) || 'idle';
}

export async function setPumpStatus(status: PumpStatus): Promise<void> {
  await redis.set('pump_status', status);
}

export async function getPumpCommand(): Promise<string | null> {
  return redis.get<string>('pump_command');
}

export async function setPumpCommand(): Promise<void> {
  await redis.set('pump_command', 'true', { ex: 300 });
}

export async function deletePumpCommand(): Promise<void> {
  await redis.del('pump_command');
}

export async function recordReading(
  moisture: number,
  options: { simulate?: boolean } = {}
): Promise<{ shouldPump: boolean; reading: Reading }> {
  const settings = await getSettings();
  const shouldPump = moisture < settings.threshold;

  const reading = await insertReading({
    moisture,
    pump_fired: shouldPump,
    trigger: 'auto',
  });

  await updateLatest(moisture);

  if (shouldPump && !options.simulate) {
    await setPumpCommand();
  }

  // Reset pump_status if it was running
  const currentStatus = await getPumpStatus();
  if (currentStatus === 'running') {
    await setPumpStatus('idle');
  }

  return { shouldPump, reading };
}

export async function triggerManualPump(): Promise<void> {
  const latest = await getLatestFromRedis();
  if (latest.moisture === null) {
    throw new Error('No moisture reading available. Wait for first reading.');
  }

  await setPumpCommand();
  await setPumpStatus('pending');

  await insertReading({
    moisture: latest.moisture,
    pump_fired: true,
    trigger: 'manual',
  });
}

export async function getDashboardData(): Promise<{
  moisture: number | null;
  ts: number | null;
  pumpStatus: PumpStatus;
  lastPump: { ts: number; trigger: 'auto' | 'manual' } | null;
}> {
  const [latest, pumpStatus, lastPump] = await Promise.all([
    getLatestFromRedis(),
    getPumpStatus(),
    getLastPumpReading(),
  ]);

  // Check if pending command expired
  let effectiveStatus = pumpStatus;
  if (pumpStatus === 'pending') {
    const command = await getPumpCommand();
    if (!command) {
      effectiveStatus = 'error';
      await setPumpStatus('error');
    }
  }

  return {
    moisture: latest.moisture,
    ts: latest.ts,
    pumpStatus: effectiveStatus,
    lastPump: lastPump
      ? { ts: new Date(lastPump.created_at).getTime(), trigger: lastPump.trigger }
      : null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/services/irrigation-service.ts
git commit -m "feat(services): add irrigation service with Redis and Supabase logic"
```

---

### Task 1.7: Create GET /api/settings

**Files:**
- Create: `src/app/api/settings/route.ts`

- [ ] **Step 1: Write settings GET route**

```typescript
import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/services/irrigation-service';

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}
```

- [ ] **Step 2: Test with curl**

Run:
```bash
curl http://localhost:3000/api/settings
```

Expected: `{ "threshold": 40, "intervalMin": 5, "pumpSec": 5 }`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/route.ts
git commit -m "feat(api): add GET /api/settings endpoint"
```

---

## Chunk 2: Dashboard + Simulator

### Task 2.1: Create POST /api/reading

**Files:**
- Create: `src/app/api/reading/route.ts`

- [ ] **Step 1: Write reading POST route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/auth';
import { recordReading } from '@/lib/services/irrigation-service';

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const moisture = parseInt(body.moisture);

    if (isNaN(moisture) || moisture < 0 || moisture > 100) {
      return NextResponse.json(
        { error: 'Invalid moisture value. Must be 0-100.' },
        { status: 400 }
      );
    }

    const { shouldPump } = await recordReading(moisture);
    return NextResponse.json({ ok: true, shouldPump });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test with curl**

Run:
```bash
curl -X POST http://localhost:3000/api/reading \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ARDUINO_API_KEY" \
  -d '{"moisture": 45}'
```

Expected: `{ "ok": true, "shouldPump": false }`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reading/route.ts
git commit -m "feat(api): add POST /api/reading endpoint for Arduino"
```

---

### Task 2.2: Create GET /api/latest

**Files:**
- Create: `src/app/api/latest/route.ts`

- [ ] **Step 1: Write latest GET route**

```typescript
import { NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/services/irrigation-service';

export async function GET() {
  const data = await getDashboardData();
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Test with curl**

Run:
```bash
curl http://localhost:3000/api/latest
```

Expected: `{ "moisture": 45, "ts": 1234567890, "pumpStatus": "idle", "lastPump": null }`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/latest/route.ts
git commit -m "feat(api): add GET /api/latest endpoint"
```

---

### Task 2.3: Create POST /api/simulate

**Files:**
- Create: `src/app/api/simulate/route.ts`

- [ ] **Step 1: Write simulate POST route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { recordReading } from '@/lib/services/irrigation-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const moisture = parseInt(body.moisture);

    if (isNaN(moisture) || moisture < 0 || moisture > 100) {
      return NextResponse.json(
        { error: 'Invalid moisture value. Must be 0-100.' },
        { status: 400 }
      );
    }

    const { shouldPump } = await recordReading(moisture, { simulate: true });
    return NextResponse.json({ ok: true, shouldPump });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test with curl**

Run:
```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"moisture": 30}'
```

Expected: `{ "ok": true, "shouldPump": true }` (assuming default threshold 40)

Verify no pump_command created in Redis (since simulate=true)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/simulate/route.ts
git commit -m "feat(api): add POST /api/simulate endpoint for dashboard simulator"
```

---

### Task 2.4: Create MoistureGauge Component

**Files:**
- Create: `src/components/moisture-gauge.tsx`

- [ ] **Step 1: Write MoistureGauge component**

```typescript
'use client';

import { cn } from '@/lib/utils';

interface MoistureGaugeProps {
  moisture: number | null;
  threshold: number;
  lastSeenMinutes: number | null;
}

export function MoistureGauge({ moisture, threshold, lastSeenMinutes }: MoistureGaugeProps) {
  const isStale = lastSeenMinutes !== null && lastSeenMinutes > 15;
  const isNoData = moisture === null;

  const percentage = isNoData ? 0 : moisture;
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (isNoData || isStale) return 'text-gray-400';
    if (moisture! < threshold) return 'text-red-500';
    return 'text-green-500';
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={cn('relative w-48 h-48', isStale && 'opacity-50')}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            className="text-muted"
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={cn('transition-all duration-500', getColor())}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-4xl font-bold', getColor())}>
            {isNoData ? '--' : moisture}
          </span>
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>

      {isStale && lastSeenMinutes !== null && (
        <div className="text-sm text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full">
          Last seen {Math.floor(lastSeenMinutes)} min ago
        </div>
      )}

      {isNoData && (
        <div className="text-sm text-gray-500">
          No data yet. Use simulator to send a reading.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/moisture-gauge.tsx
git commit -m "feat(ui): add MoistureGauge component"
```

---

### Task 2.5: Create SimulatorControls Component

**Files:**
- Create: `src/components/simulator-controls.tsx`

- [ ] **Step 1: Write SimulatorControls component**

```typescript
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface SimulatorControlsProps {
  onReadingSent?: () => void;
}

export function SimulatorControls({ onReadingSent }: SimulatorControlsProps) {
  const [moisture, setMoisture] = useState<string>('50');
  const [autoSimulate, setAutoSimulate] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendReading = useCallback(async (value: number) => {
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moisture: value }),
      });
      if (!res.ok) throw new Error('Failed to send reading');
      onReadingSent?.();
    } catch (err) {
      console.error('Simulator error:', err);
    }
  }, [onReadingSent]);

  const handleManualSend = () => {
    const val = parseInt(moisture);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      sendReading(val);
    }
  };

  const handleRandomSend = () => {
    const val = Math.floor(Math.random() * 101);
    setMoisture(val.toString());
    sendReading(val);
  };

  useEffect(() => {
    if (autoSimulate) {
      intervalRef.current = setInterval(() => {
        const val = Math.floor(Math.random() * 101);
        setMoisture(val.toString());
        sendReading(val);
      }, 60000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoSimulate, sendReading]);

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <h3 className="font-semibold">Simulator</h3>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Label htmlFor="moisture-input">Moisture (%)</Label>
          <Input
            id="moisture-input"
            type="number"
            min={0}
            max={100}
            value={moisture}
            onChange={(e) => setMoisture(e.target.value)}
          />
        </div>
        <Button onClick={handleManualSend} className="mt-6">
          Send Reading
        </Button>
        <Button onClick={handleRandomSend} variant="outline" className="mt-6">
          Random
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="auto-sim"
          checked={autoSimulate}
          onCheckedChange={setAutoSimulate}
        />
        <Label htmlFor="auto-sim">
          Auto-simulate every 60s
        </Label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/simulator-controls.tsx
git commit -m "feat(ui): add SimulatorControls component"
```

---

### Task 2.6: Create Dashboard Home Page

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx` (add Sonner)

- [ ] **Step 1: Write dashboard page**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { MoistureGauge } from '@/components/moisture-gauge';
import { SimulatorControls } from '@/components/simulator-controls';
import { LatestReading } from '@/lib/types';

export default function DashboardPage() {
  const [data, setData] = useState<LatestReading | null>(null);
  const [settings, setSettings] = useState<{ threshold: number } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [latestRes, settingsRes] = await Promise.all([
        fetch('/api/latest'),
        fetch('/api/settings'),
      ]);

      if (latestRes.ok && settingsRes.ok) {
        const latest = await latestRes.json();
        const sett = await settingsRes.json();
        setData(latest);
        setSettings(sett);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const lastSeenMinutes = data?.ts
    ? (Date.now() - data.ts) / 60000
    : null;

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Irrigation Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <MoistureGauge
          moisture={data?.moisture ?? null}
          threshold={settings?.threshold ?? 40}
          lastSeenMinutes={lastSeenMinutes}
        />

        <div className="flex flex-col justify-center space-y-4">
          <div className="p-4 border rounded-lg">
            <h2 className="font-semibold mb-2">Status</h2>
            <p className="text-sm text-muted-foreground">
              Pump: <span className="capitalize">{data?.pumpStatus || 'idle'}</span>
            </p>
            {data?.lastPump && (
              <p className="text-sm text-muted-foreground mt-1">
                Last pump: {new Date(data.lastPump.ts).toLocaleString()} ({data.lastPump.trigger})
              </p>
            )}
          </div>
        </div>
      </div>

      <SimulatorControls onReadingSent={fetchData} />
    </main>
  );
}
```

- [ ] **Step 2: Update layout.tsx to add Sonner**

Modify `src/app/layout.tsx` to import and include `<Toaster />` from sonner:

```typescript
import { Toaster } from '@/components/ui/sonner';
```

Add `<Toaster />` inside the body, after `{children}`.

- [ ] **Step 3: Run dev and test manually**

Run:
```bash
pnpm dev
```

Open http://localhost:3000

Test:
1. Dashboard loads with "No data yet"
2. Click "Random" in simulator → gauge updates with random value
3. Wait 30s → gauge auto-refreshes
4. Send moisture = 20 → shouldPump should trigger (check `/api/latest` for pumpStatus change)

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx
git commit -m "feat(dashboard): add home page with moisture gauge and simulator"
```

---

## Chunk 3: Pump Control

### Task 3.1: Create POST /api/pump

**Files:**
- Create: `src/app/api/pump/route.ts`

- [ ] **Step 1: Write pump POST route**

```typescript
import { NextResponse } from 'next/server';
import { triggerManualPump } from '@/lib/services/irrigation-service';

export async function POST() {
  try {
    await triggerManualPump();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Test with curl**

First send a reading:
```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"moisture": 50}'
```

Then trigger pump:
```bash
curl -X POST http://localhost:3000/api/pump
```

Expected: `{ "ok": true }`

Test error case (no readings):
```bash
# (clear readings table first, or test on fresh env)
curl -X POST http://localhost:3000/api/pump
```

Expected: `{ "error": "No moisture reading available..." }` with 400

- [ ] **Step 3: Commit**

```bash
git add src/app/api/pump/route.ts
git commit -m "feat(api): add POST /api/pump endpoint for manual trigger"
```

---

### Task 3.2: Create GET /api/command

**Files:**
- Create: `src/app/api/command/route.ts`

- [ ] **Step 1: Write command GET route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/auth';
import { getPumpCommand, deletePumpCommand, setPumpStatus } from '@/lib/services/irrigation-service';

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return unauthorizedResponse();
  }

  try {
    const command = await getPumpCommand();

    if (command) {
      await deletePumpCommand();
      await setPumpStatus('running');
      return NextResponse.json({ pump: true });
    }

    return NextResponse.json({ pump: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test with curl**

First trigger pump from dashboard:
```bash
curl -X POST http://localhost:3000/api/pump
```

Then Arduino polls:
```bash
curl http://localhost:3000/api/command \
  -H "x-api-key: $ARDUINO_API_KEY"
```

Expected first poll: `{ "pump": true }`
Expected second poll: `{ "pump": false }`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/command/route.ts
git commit -m "feat(api): add GET /api/command endpoint for Arduino polling"
```

---

### Task 3.3: Create PumpCard Component

**Files:**
- Create: `src/components/pump-card.tsx`

- [ ] **Step 1: Write PumpCard component**

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PumpStatus } from '@/lib/types';

interface PumpCardProps {
  status: PumpStatus;
  lastPump: { ts: number; trigger: 'auto' | 'manual' } | null;
  hasReading: boolean;
  onTrigger: () => Promise<void>;
}

export function PumpCard({ status, lastPump, hasReading, onTrigger }: PumpCardProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleTrigger = async () => {
    setLoading(true);
    try {
      await onTrigger();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const getStatusColor = (s: PumpStatus) => {
    switch (s) {
      case 'idle': return 'bg-gray-100 text-gray-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'running': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
    }
  };

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Pump Control</h2>
        <Badge className={getStatusColor(status)}>
          {status}
        </Badge>
      </div>

      {lastPump && (
        <p className="text-sm text-muted-foreground">
          Last triggered: {new Date(lastPump.ts).toLocaleString()} ({lastPump.trigger})
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button disabled={!hasReading || status === 'pending' || status === 'running'}>
            {!hasReading ? 'Waiting for first reading...' : 'Trigger Pump'}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Pump Trigger</DialogTitle>
            <DialogDescription>
              Are you sure you want to manually trigger the pump?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTrigger} disabled={loading}>
              {loading ? 'Triggering...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {status === 'error' && (
        <p className="text-sm text-red-600">
          Pump command expired. Please try again.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pump-card.tsx
git commit -m "feat(ui): add PumpCard component with confirmation dialog"
```

---

### Task 3.4: Update Dashboard Page with PumpCard

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Integrate PumpCard into dashboard**

Update the right column of the grid to use `PumpCard`:

```typescript
import { PumpCard } from '@/components/pump-card';
import { toast } from 'sonner';
```

Replace the static status div with:

```typescript
<PumpCard
  status={data?.pumpStatus || 'idle'}
  lastPump={data?.lastPump || null}
  hasReading={data?.moisture !== null}
  onTrigger={async () => {
    const res = await fetch('/api/pump', { method: 'POST' });
    if (res.ok) {
      toast.success('Pump triggered');
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to trigger pump');
    }
  }}
/>
```

- [ ] **Step 2: Test manually**

1. Load dashboard
2. Send a reading via simulator
3. Click "Trigger Pump" → confirm dialog appears
4. Confirm → toast shows success, status changes to "pending"
5. Poll `/api/command` with Arduino key → status changes to "running"
6. Send another reading → status returns to "idle"

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(dashboard): integrate PumpCard into home page"
```

---

## Verification Checklist

Before proceeding to Part 2, verify:

- [ ] `pnpm build` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] All API routes respond correctly to curl tests
- [ ] Dashboard shows live moisture gauge updating every 30s
- [ ] Simulator sends readings successfully
- [ ] Manual pump trigger works end-to-end (dashboard → API → Redis → /api/command)
- [ ] Pump status transitions correctly: idle → pending → running → idle
- [ ] No `.env.local` or secrets committed

---

## Next Steps

Proceed to **Part 2** for:
- Settings page (POST /api/settings, threshold configuration)
- Logs page (/api/logs, history table)
- Navigation, responsive design, and polish
