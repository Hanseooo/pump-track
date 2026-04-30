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
