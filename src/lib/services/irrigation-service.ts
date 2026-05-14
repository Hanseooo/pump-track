import {
  getSettings as getSettingsFromDb,
  saveSettings as saveSettingsToDb,
  getLatestReading,
  getLastPumpReading,
  insertReading,
  getAppState,
  setPumpStatusInDb,
  setPumpCommandInDb,
  deletePumpCommandInDb,
  setPumpCommandExpiredInDb,
} from '@/lib/supabase';
import { Reading, Settings, PumpStatus } from '@/lib/types';

const DEFAULT_SETTINGS: Settings = {
  threshold: 40,
  intervalMin: 5,
  pumpSec: 5,
  commandPollSec: 30,
};

export async function getSettings(): Promise<Settings> {
  try {
    return await getSettingsFromDb();
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  return saveSettingsToDb(settings);
}

export async function getPumpStatus(): Promise<PumpStatus> {
  const state = await getAppState();

  // Check expiry
  if (state.pumpCommand && state.pumpCommandExpiresAt) {
    const expires = new Date(state.pumpCommandExpiresAt).getTime();
    if (Date.now() > expires) {
      await setPumpCommandExpiredInDb();
      return 'error';
  }
  }

  return (state.pumpStatus as PumpStatus) || 'idle';
}

export async function setPumpStatus(status: PumpStatus): Promise<void> {
  await setPumpStatusInDb(status);
}

export async function getPumpCommand(): Promise<string | null> {
  const state = await getAppState();

  if (!state.pumpCommand) return null;

  // Check expiry
  if (state.pumpCommandExpiresAt) {
    const expires = new Date(state.pumpCommandExpiresAt).getTime();
    if (Date.now() > expires) {
      await setPumpCommandExpiredInDb();
      return null;
    }
  }

  return state.pumpCommand;
}

export async function setPumpCommand(): Promise<void> {
  await setPumpCommandInDb();
}

export async function deletePumpCommand(): Promise<void> {
  await deletePumpCommandInDb();
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

  if (shouldPump && !options.simulate) {
    await setPumpCommandInDb();
    await setPumpStatusInDb('pending');
  }

  const currentStatus = await getPumpStatus();
  if (currentStatus === 'running') {
    await setPumpStatusInDb('idle');
  }

  return { shouldPump, reading };
}

export async function triggerManualPump(): Promise<void> {
  const latest = await getLatestReading();
  const moisture = latest?.moisture ?? 50;

  await setPumpCommandInDb();
  await setPumpStatusInDb('pending');

  await insertReading({
    moisture,
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
    getLatestReading(),
    getPumpStatus(),
    getLastPumpReading(),
  ]);

  return {
    moisture: latest?.moisture ?? null,
    ts: latest ? new Date(latest.created_at).getTime() : null,
    pumpStatus,
    lastPump: lastPump
      ? { ts: new Date(lastPump.created_at).getTime(), trigger: lastPump.trigger }
      : null,
  };
}
