import { createClient } from '@supabase/supabase-js';
import { Reading, Settings } from './types';

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

// ── Settings (singleton) ──────────────────────────────────

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return {
      threshold: 40,
      intervalMin: 5,
      pumpSec: 5,
      commandPollSec: 30,
    };
  }

  return {
    threshold: data.threshold,
    intervalMin: data.interval_min,
    pumpSec: data.pump_sec,
    commandPollSec: data.command_poll_sec,
  };
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const clamped = {
    threshold: Math.max(0, Math.min(100, settings.threshold)),
    interval_min: Math.max(1, Math.min(30, settings.intervalMin)),
    pump_sec: Math.max(1, Math.min(60, settings.pumpSec)),
    command_poll_sec: Math.max(5, Math.min(300, settings.commandPollSec)),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('app_settings')
    .upsert({ id: 1, ...clamped });

  if (error) throw error;

  return {
    threshold: clamped.threshold,
    intervalMin: clamped.interval_min,
    pumpSec: clamped.pump_sec,
    commandPollSec: clamped.command_poll_sec,
  };
}

// ── App State (singleton) ─────────────────────────────────

export async function getAppState(): Promise<{
  pumpStatus: string;
  pumpCommand: string | null;
  pumpCommandExpiresAt: string | null;
}> {
  const { data, error } = await supabase
    .from('app_state')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return {
      pumpStatus: 'idle',
      pumpCommand: null,
      pumpCommandExpiresAt: null,
    };
  }

  return {
    pumpStatus: data.pump_status,
    pumpCommand: data.pump_command,
    pumpCommandExpiresAt: data.pump_command_expires_at,
  };
}

export async function setPumpStatusInDb(status: string): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .upsert({
      id: 1,
      pump_status: status,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

export async function setPumpCommandInDb(): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .upsert({
      id: 1,
      pump_command: 'true',
      pump_command_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

export async function deletePumpCommandInDb(): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .update({
      pump_command: null,
      pump_command_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  if (error) throw error;
}

export async function setPumpCommandExpiredInDb(): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .update({
      pump_command: null,
      pump_command_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  if (error) throw error;
}
