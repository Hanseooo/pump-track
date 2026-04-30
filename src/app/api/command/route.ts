import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/auth';
import { getPumpCommand, deletePumpCommand, setPumpStatus } from '@/lib/services/irrigation-service';

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return unauthorizedResponse();
  }

  try {
    const command = await getPumpCommand();

    if (command) {
      await deletePumpCommand();
      await setPumpStatus('running');
      return NextResponse.json({ pump: true });
    }

    return NextResponse.json({ pump: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
