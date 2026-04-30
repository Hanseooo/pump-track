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
