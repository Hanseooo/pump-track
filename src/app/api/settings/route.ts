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

    const threshold = parseInt(body.threshold, 10);
    const intervalMin = parseInt(body.intervalMin, 10);
    const pumpSec = parseInt(body.pumpSec, 10);

    if (isNaN(threshold) || isNaN(intervalMin) || isNaN(pumpSec)) {
      return NextResponse.json(
        { error: 'Invalid settings values' },
        { status: 400 }
      );
    }

    const settings: Settings = { threshold, intervalMin, pumpSec };
    const saved = await saveSettings(settings);
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    console.error('POST /api/settings error:', error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
