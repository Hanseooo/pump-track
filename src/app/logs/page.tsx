import Link from 'next/link';
import { LogsTable } from '@/components/logs-table';
import { Button } from '@/components/ui/button';
import { getReadings } from '@/lib/supabase';

interface LogsPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const limit = parseInt(params.limit || '25', 10);

  if (isNaN(page) || page < 1 || isNaN(limit) || limit < 1) {
    return (
      <div className="p-4 border border-red-200 bg-red-50 rounded-lg text-red-800">
        Invalid page or limit parameters.
      </div>
    );
  }

  let readings;
  let total;
  try {
    const result = await getReadings(page, limit);
    readings = result.readings;
    total = result.total;
  } catch {
    return (
      <div className="p-4 border border-red-200 bg-red-50 rounded-lg text-red-800">
        Failed to load logs.
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">History</h1>

      <div className="overflow-x-auto">
        <LogsTable readings={readings} />
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {page > 1 && (
            <Button variant="outline" asChild>
              <Link href={`/logs?page=${page - 1}&limit=${limit}`}>Previous</Link>
            </Button>
          )}
          <span className="flex items-center px-4">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Button variant="outline" asChild>
              <Link href={`/logs?page=${page + 1}&limit=${limit}`}>Next</Link>
            </Button>
          )}
        </div>
      )}
    </main>
  );
}
