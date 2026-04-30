import { NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/services/irrigation-service';

export async function GET() {
  const data = await getDashboardData();
  return NextResponse.json(data);
}
