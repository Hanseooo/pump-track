'use client';

import { useState, useEffect, useCallback } from 'react';
import { MoistureGauge } from '@/components/moisture-gauge';
import { SimulatorControls } from '@/components/simulator-controls';
import { PumpCard } from '@/components/pump-card';
import { LatestReading } from '@/lib/types';
import { toast } from 'sonner';

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

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 0);
    const interval = setInterval(fetchData, 30000);
    const nowInterval = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      clearInterval(nowInterval);
    };
  }, [fetchData]);

  const lastSeenMinutes = data?.ts ? (now - data.ts) / 60000 : null;

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
        </div>
      </div>

      <SimulatorControls onReadingSent={fetchData} />
    </main>
  );
}
