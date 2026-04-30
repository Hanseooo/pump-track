# IoT Irrigation Dashboard — Implementation Plan Part 2

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the irrigation dashboard with settings configuration, historical logs, navigation, and responsive polish.

**Architecture:** Next.js 16 App Router with TypeScript. Supabase PostgreSQL for readings history, Upstash Redis for settings/latest/command state. Service layer in `src/lib/services/` keeps API routes thin. shadcn/ui components for UI.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase, Upstash Redis, pnpm

**Prerequisites:**
- Part 1 must be complete and verified
- Read `docs/dev/PRD.md`, `docs/dev/SCHEMA.md`, `docs/dev/BACKEND.md`, `docs/dev/DASHBOARD.md`, `docs/dev/modularity.md`
- Read `docs/superpowers/specs/2026-04-30-iot-irrigation-dashboard-design.md`
- Read `docs/superpowers/plans/2026-04-30-iot-irrigation-dashboard-part1.md`

---

## Chunk 4: Settings

### Task 4.1: Create POST /api/settings

**Files:**
- Create: `src/app/api/settings/route.ts` (add POST handler)

- [ ] **Step 1: Add POST handler to existing settings route**

The file `src/app/api/settings/route.ts` already exists from Part 1 with a GET handler. Add the POST handler:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/services/irrigation-service';
import { Settings } from '@/lib/types';

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const settings: Settings = {
      threshold: parseInt(body.threshold),
      intervalMin: parseInt(body.intervalMin),
      pumpSec: parseInt(body.pumpSec),
    };

    if (
      isNaN(settings.threshold) ||
      isNaN(settings.intervalMin) ||
      isNaN(settings.pumpSec)
    ) {
      return NextResponse.json(
        { error: 'Invalid settings values' },
        { status: 400 }
      );
    }

    const saved = await saveSettings(settings);
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test with curl**

Run:
```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"threshold": 50, "intervalMin": 10, "pumpSec": 10}'
```

Expected: `{ "ok": true, "saved": { "threshold": 50, "intervalMin": 10, "pumpSec": 10 } }`

Test clamping:
```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"threshold": 999, "intervalMin": 99, "pumpSec": 99}'
```

Expected: `{ "ok": true, "saved": { "threshold": 100, "intervalMin": 30, "pumpSec": 60 } }`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/route.ts
git commit -m "feat(api): add POST /api/settings with clamping validation"
```

---

### Task 4.2: Create SettingsForm Component

**Files:**
- Create: `src/components/settings-form.tsx`

- [ ] **Step 1: Write SettingsForm component**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Settings } from '@/lib/types';

interface SettingsFormProps {
  initialSettings?: Settings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [settings, setSettings] = useState<Settings>({
    threshold: 40,
    intervalMin: 5,
    pumpSec: 5,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        toast.success('Settings saved');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save settings');
      }
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="threshold">Moisture Threshold: {settings.threshold}%</Label>
        <Slider
          id="threshold"
          min={0}
          max={100}
          step={1}
          value={[settings.threshold]}
          onValueChange={([v]) => setSettings((s) => ({ ...s, threshold: v }))}
        />
        <p className="text-sm text-muted-foreground">
          Pump will trigger when moisture falls below this value.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="intervalMin">Reading Interval (minutes)</Label>
        <Input
          id="intervalMin"
          type="number"
          min={1}
          max={30}
          value={settings.intervalMin}
          onChange={(e) =>
            setSettings((s) => ({ ...s, intervalMin: parseInt(e.target.value) || 1 }))
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pumpSec">Pump Duration (seconds)</Label>
        <Input
          id="pumpSec"
          type="number"
          min={1}
          max={60}
          value={settings.pumpSec}
          onChange={(e) =>
            setSettings((s) => ({ ...s, pumpSec: parseInt(e.target.value) || 1 }))
          }
        />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Save Settings'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings-form.tsx
git commit -m "feat(ui): add SettingsForm component with slider and inputs"
```

---

### Task 4.3: Create Settings Page

**Files:**
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Write settings page**

```typescript
import { SettingsForm } from '@/components/settings-form';
import { getSettings } from '@/lib/services/irrigation-service';

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <main className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      <SettingsForm initialSettings={settings} />
    </main>
  );
}
```

- [ ] **Step 2: Test manually**

1. Navigate to http://localhost:3000/settings
2. Change threshold slider → value updates live
3. Change interval and duration
4. Click Save → toast shows success
5. Refresh page → values persist

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat(settings): add settings page with configuration form"
```

---

## Chunk 5: Logs

### Task 5.1: Create GET /api/logs

**Files:**
- Create: `src/app/api/logs/route.ts`

- [ ] **Step 1: Write logs GET route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getReadings } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);

    const { readings, total } = await getReadings(page, limit);
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      readings,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test with curl**

Run:
```bash
curl "http://localhost:3000/api/logs?page=1&limit=25"
```

Expected: `{ "readings": [...], "total": N, "page": 1, "totalPages": M }`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/logs/route.ts
git commit -m "feat(api): add GET /api/logs with pagination"
```

---

### Task 5.2: Create LogsTable Component

**Files:**
- Create: `src/components/logs-table.tsx`

- [ ] **Step 1: Write LogsTable component**

```typescript
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Reading } from '@/lib/types';

interface LogsTableProps {
  readings: Reading[];
}

export function LogsTable({ readings }: LogsTableProps) {
  if (readings.length === 0) {
    return <p className="text-muted-foreground">No readings yet.</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Moisture</TableHead>
            <TableHead>Pump Fired</TableHead>
            <TableHead>Trigger</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {readings.map((reading) => (
            <TableRow key={reading.id}>
              <TableCell>
                {new Date(reading.created_at).toLocaleString()}
              </TableCell>
              <TableCell>{reading.moisture}%</TableCell>
              <TableCell>
                {reading.pump_fired ? (
                  <Badge variant="default">Yes</Badge>
                ) : (
                  <Badge variant="secondary">No</Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={reading.trigger === 'auto' ? 'outline' : 'default'}>
                  {reading.trigger}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/logs-table.tsx
git commit -m "feat(ui): add LogsTable component"
```

---

### Task 5.3: Create Logs Page

**Files:**
- Create: `src/app/logs/page.tsx`

- [ ] **Step 1: Write logs page**

```typescript
import { LogsTable } from '@/components/logs-table';
import { Button } from '@/components/ui/button';
import { LogsResponse } from '@/lib/types';

interface LogsPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || '1');
  const limit = parseInt(params.limit || '25');

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/logs?page=${page}&limit=${limit}`,
    { cache: 'no-store' }
  );

  if (!res.ok) {
    return <div>Failed to load logs.</div>;
  }

  const data: LogsResponse = await res.json();

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">History</h1>

      <LogsTable readings={data.readings} />

      {data.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {page > 1 && (
            <Button variant="outline" asChild>
              <a href={`/logs?page=${page - 1}&limit=${limit}`}>Previous</a>
            </Button>
          )}
          <span className="flex items-center px-4">
            Page {page} of {data.totalPages}
          </span>
          {page < data.totalPages && (
            <Button variant="outline" asChild>
              <a href={`/logs?page=${page + 1}&limit=${limit}`}>Next</a>
            </Button>
          )}
        </div>
      )}
    </main>
  );
}
```

> **Note:** If Next.js 16 requires `searchParams` to be synchronous, remove the `await` and use `searchParams` directly.

- [ ] **Step 2: Test manually**

1. Navigate to http://localhost:3000/logs
2. Verify table shows readings
3. Verify pagination works if >25 readings
4. Verify mobile view is readable

- [ ] **Step 3: Commit**

```bash
git add src/app/logs/page.tsx
git commit -m "feat(logs): add logs page with pagination"
```

---

## Chunk 6: Polish

### Task 6.1: Create Nav Component

**Files:**
- Create: `src/components/nav.tsx`

- [ ] **Step 1: Write Nav component**

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/logs', label: 'History' },
  { href: '/settings', label: 'Settings' },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg">
          PumpTrack
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'text-sm transition-colors hover:text-primary',
                pathname === item.href
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile nav */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="outline" size="icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </Button>
          </SheetTrigger>
          <SheetContent side="right">
            <nav className="flex flex-col gap-4 mt-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'text-lg transition-colors hover:text-primary',
                    pathname === item.href
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/nav.tsx
git commit -m "feat(ui): add responsive Nav component with mobile drawer"
```

---

### Task 6.2: Update Layout with Nav

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Integrate Nav into layout**

```typescript
import { Nav } from '@/components/nav';
```

Add `<Nav />` inside the body, before `{children}`.

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(layout): integrate Nav into root layout"
```

---

### Task 6.3: Add Loading States

**Files:**
- Create: `src/components/loading-skeleton.tsx`

- [ ] **Step 1: Write loading skeleton component**

```typescript
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardContent className="pt-6 flex justify-center">
            <Skeleton className="h-48 w-48 rounded-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-28" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
```

Note: If `skeleton` is not installed, install it:
```bash
npx shadcn@latest add skeleton
```

- [ ] **Step 2: Commit**

```bash
git add src/components/loading-skeleton.tsx
git commit -m "feat(ui): add dashboard loading skeleton"
```

---

### Task 6.4: Responsive Refinements

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/logs/page.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Verify responsive behavior**

Test each page at these viewports:
- 320px (small mobile)
- 768px (tablet)
- 1024px+ (desktop)

Fix any overflow, misalignment, or unreadable text.

Common fixes to apply:

**Dashboard page (`src/app/page.tsx`):**
- Ensure grid switches to single column on mobile
- Ensure gauge scales down (w-48 is fine, verify it fits)

**Logs page (`src/app/logs/page.tsx`):**
- Table should be scrollable horizontally on mobile:
  ```tsx
  <div className="overflow-x-auto">
    <LogsTable readings={data.readings} />
  </div>
  ```

**Settings page (`src/app/settings/page.tsx`):**
- Form should be full-width on mobile, max-w-md on desktop (already done)

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx src/app/logs/page.tsx src/app/settings/page.tsx
git commit -m "style: responsive refinements across all pages"
```

---

### Task 6.5: Error State Handling

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add error fallback to dashboard**

Update the dashboard fetch logic to show an error state:

```typescript
const [error, setError] = useState<string | null>(null);

const fetchData = useCallback(async () => {
  try {
    setError(null);
    // ... existing fetch logic
  } catch (err) {
    setError('Unable to load dashboard data. Please try again.');
    console.error('Failed to fetch dashboard data:', err);
  }
}, []);
```

Add error UI:

```tsx
{error && (
  <div className="p-4 border border-red-200 bg-red-50 rounded-lg text-red-800 mb-4">
    <p>{error}</p>
    <Button onClick={fetchData} variant="outline" className="mt-2">
      Retry
    </Button>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(dashboard): add error state with retry button"
```

---

## Verification Checklist

Before marking complete, verify:

- [ ] `pnpm build` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] All API routes respond correctly to curl tests
- [ ] Settings page saves and persists values
- [ ] Auto-pump triggers when moisture < threshold
- [ ] Logs page shows paginated history
- [ ] Navigation works on desktop and mobile
- [ ] Dashboard is responsive at 320px, 768px, 1024px
- [ ] Error states show correctly when APIs fail
- [ ] No `.env.local` or secrets committed

---

## Final Steps

- [ ] Run `pnpm build && pnpm lint` one final time
- [ ] Review all changed files with `git diff`
- [ ] Ensure `.env.local` is in `.gitignore`
- [ ] Update `docs/dev/BACKEND.md`, `docs/dev/DASHBOARD.md`, `docs/dev/SCHEMA.md`, `docs/dev/PRD.md` to match implemented API shapes
- [ ] Commit documentation updates

**Plan complete.**
