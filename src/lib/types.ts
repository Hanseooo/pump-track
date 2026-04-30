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
