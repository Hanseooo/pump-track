import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/services/irrigation-service';

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}
