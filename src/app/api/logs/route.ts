import { NextRequest, NextResponse } from 'next/server';
import { getReadings } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);

    if (isNaN(page) || page < 1 || isNaN(limit) || limit < 1) {
      return NextResponse.json({ error: 'Invalid page or limit' }, { status: 400 });
    }

    const { readings, total } = await getReadings(page, limit);
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      readings,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
