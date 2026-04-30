import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/auth';
import { recordReading } from '@/lib/services/irrigation-service';

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const moisture = parseInt(body.moisture);

    if (isNaN(moisture) || moisture < 0 || moisture > 100) {
      return NextResponse.json(
        { error: 'Invalid moisture value. Must be 0-100.' },
        { status: 400 }
      );
    }

    const { shouldPump } = await recordReading(moisture);
    return NextResponse.json({ ok: true, shouldPump });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
