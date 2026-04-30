# Dashboard Implementation Guide
## Next.js 16 Frontend — Tailwind CSS + shadcn/ui

> See SETUP.md for shadcn/ui installation and component list.
> See SCHEMA.md for API response shapes.

---

## Types (`src/lib/types.ts`)

```typescript
export type Reading = {
  id: number
  moisture: number
  pump_fired: boolean
  trigger: 'auto' | 'manual'
  created_at: string
}

export type Settings = {
  threshold: number
  intervalMin: number
  pumpSec: number
}

export type LatestReading = {
  moisture: number | null
  ts: number | null
}
```

---

## Root Layout (`src/app/layout.tsx`)

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Irrigation Dashboard',
  description: 'IoT smart irrigation monitoring system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
```

---

## Nav Component (`src/components/nav.tsx`)

```typescript
import Link from 'next/link'
import { Separator } from '@/components/ui/separator'

export function Nav() {
  return (
    <nav className="flex items-center gap-6 mb-8">
      <Link href="/" className="font-semibold text-slate-800 hover:text-slate-600">
        Dashboard
      </Link>
      <Link href="/logs" className="text-slate-500 hover:text-slate-800">
        Logs
      </Link>
      <Link href="/settings" className="text-slate-500 hover:text-slate-800">
        Settings
      </Link>
    </nav>
  )
}
```

---

## Main Dashboard Page (`src/app/page.tsx`)

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Nav } from '@/components/nav'
import type { LatestReading, Settings } from '@/lib/types'

type PumpStatus = 'idle' | 'sending' | 'queued'

export default function DashboardPage() {
  const [latest, setLatest] = useState<LatestReading>({ moisture: null, ts: null })
  const [settings, setSettings] = useState<Settings>({ threshold: 40, intervalMin: 5, pumpSec: 5 })
  const [pumpStatus, setPumpStatus] = useState<PumpStatus>('idle')
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    const [latestRes, settingsRes] = await Promise.all([
      fetch('/api/latest').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ])
    setLatest(latestRes)
    setSettings(settingsRes)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [])

  async function triggerPump() {
    setPumpStatus('sending')
    await fetch('/api/pump', { method: 'POST' })
    setPumpStatus('queued')
    setTimeout(() => setPumpStatus('idle'), 5000)
  }

  const moisture = latest.moisture
  const isDry = moisture !== null && moisture < settings.threshold
  const lastSeen = latest.ts
    ? new Date(latest.ts).toLocaleString()
    : 'No data yet'

  return (
    <main className="max-w-2xl mx-auto p-8">
      <Nav />

      <h1 className="text-2xl font-bold text-slate-800 mb-6">Irrigation Dashboard</h1>

      {/* Moisture Card */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base font-medium text-slate-600">
            Soil Moisture
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-sm">Loading...</p>
          ) : (
            <>
              <div className="flex items-end gap-3 mb-3">
                <span
                  className="text-5xl font-bold"
                  style={{ color: isDry ? '#ef4444' : '#22c55e' }}
                >
                  {moisture !== null ? `${moisture}%` : '--'}
                </span>
                {isDry && (
                  <Badge variant="destructive" className="mb-1">
                    Needs water
                  </Badge>
                )}
                {moisture !== null && !isDry && (
                  <Badge variant="secondary" className="mb-1 bg-green-100 text-green-700">
                    Healthy
                  </Badge>
                )}
              </div>
              <Progress
                value={moisture ?? 0}
                className="h-3 mb-2"
              />
              <p className="text-xs text-slate-400">
                Last reading: {lastSeen}
              </p>
              <p className="text-xs text-slate-400">
                Auto-waters below {settings.threshold}% · reads every {settings.intervalMin} min
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pump Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium text-slate-600">
            Water Pump
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-4">
            Manually trigger a watering cycle. The Arduino will run the pump for{' '}
            {settings.pumpSec} seconds on its next poll.
          </p>
          <Button
            onClick={triggerPump}
            disabled={pumpStatus !== 'idle'}
            className="w-full"
          >
            {pumpStatus === 'idle' && 'Water Now'}
            {pumpStatus === 'sending' && 'Sending...'}
            {pumpStatus === 'queued' && '✓ Command queued — awaiting Arduino'}
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
```

---

## Logs Page (`src/app/logs/page.tsx`)

```typescript
import { supabase } from '@/lib/supabase'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Nav } from '@/components/nav'
import type { Reading } from '@/lib/types'

export default async function LogsPage() {
  const { data: logs } = await supabase
    .from('readings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <main className="max-w-3xl mx-auto p-8">
      <Nav />
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Watering Logs</h1>

      <div className="rounded-lg border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Moisture</TableHead>
              <TableHead>Pump Fired</TableHead>
              <TableHead>Trigger</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                  No readings yet. Waiting for Arduino...
                </TableCell>
              </TableRow>
            )}
            {logs?.map((log: Reading) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm">
                  {new Date(log.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <span
                    className="font-medium"
                    style={{ color: log.moisture < 40 ? '#ef4444' : '#22c55e' }}
                  >
                    {log.moisture}%
                  </span>
                </TableCell>
                <TableCell>
                  {log.pump_fired ? (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      Yes
                    </Badge>
                  ) : (
                    <span className="text-slate-400 text-sm">No</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={log.trigger === 'manual' ? 'outline' : 'secondary'}>
                    {log.trigger}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  )
}
```

---

## Settings Page (`src/app/settings/page.tsx`)

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Nav } from '@/components/nav'
import type { Settings } from '@/lib/types'

export default function SettingsPage() {
  const [form, setForm] = useState<Settings>({ threshold: 40, intervalMin: 5, pumpSec: 5 })
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setForm)
  }, [])

  function update(field: keyof Settings, value: string) {
    setForm(prev => ({ ...prev, [field]: parseInt(value) || 0 }))
  }

  async function save() {
    setStatus('saving')
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setStatus(res.ok ? 'saved' : 'error')
    if (res.ok) setTimeout(() => setStatus('idle'), 3000)
  }

  return (
    <main className="max-w-lg mx-auto p-8">
      <Nav />
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Auto-Watering Configuration</CardTitle>
          <CardDescription>
            Changes are applied on the Arduino's next reading cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          <div className="space-y-2">
            <Label htmlFor="threshold">Dry Threshold (%)</Label>
            <p className="text-xs text-slate-400">
              Auto-water when moisture drops below this value. Range: 0–100.
            </p>
            <Input
              id="threshold"
              type="number"
              min={0} max={100}
              value={form.threshold}
              onChange={e => update('threshold', e.target.value)}
              className="w-24"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="intervalMin">Reading Interval (minutes)</Label>
            <p className="text-xs text-slate-400">
              How often Arduino sends a moisture reading. Range: 1–30.
            </p>
            <Input
              id="intervalMin"
              type="number"
              min={1} max={30}
              value={form.intervalMin}
              onChange={e => update('intervalMin', e.target.value)}
              className="w-24"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="pumpSec">Pump Duration (seconds)</Label>
            <p className="text-xs text-slate-400">
              How long the pump runs per watering cycle. Range: 1–60.
            </p>
            <Input
              id="pumpSec"
              type="number"
              min={1} max={60}
              value={form.pumpSec}
              onChange={e => update('pumpSec', e.target.value)}
              className="w-24"
            />
          </div>

          <Button onClick={save} disabled={status === 'saving'} className="w-full">
            {status === 'idle' && 'Save Settings'}
            {status === 'saving' && 'Saving...'}
            {status === 'saved' && '✓ Saved'}
            {status === 'error' && 'Error — try again'}
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
```

> Note: Add `import { Separator } from '@/components/ui/separator'` at the top of settings/page.tsx.

---

## shadcn/ui Components Used

| Component | Import path | Used in |
|-----------|------------|---------|
| Button | `@/components/ui/button` | Dashboard, Settings |
| Card, CardContent, CardHeader, CardTitle, CardDescription | `@/components/ui/card` | Dashboard, Settings |
| Badge | `@/components/ui/badge` | Dashboard, Logs |
| Progress | `@/components/ui/progress` | Dashboard |
| Table, TableBody, TableCell, TableHead, TableHeader, TableRow | `@/components/ui/table` | Logs |
| Input | `@/components/ui/input` | Settings |
| Label | `@/components/ui/label` | Settings |
| Separator | `@/components/ui/separator` | Settings |
