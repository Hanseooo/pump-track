import { redis } from '../redis';
import { insertReading, getLastPumpReading } from '../supabase';
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
