'use client';

import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/time-ago';

interface MoistureGaugeProps {
  moisture: number | null;
  threshold: number;
  lastSeenMinutes: number | null;
}

export function MoistureGauge({ moisture, threshold, lastSeenMinutes }: MoistureGaugeProps) {
  const isStale = lastSeenMinutes !== null && lastSeenMinutes > 15;
  const isNoData = moisture === null;

  const percentage = isNoData ? 0 : moisture;
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (isNoData || isStale) return 'text-gray-400';
    if (moisture! < threshold) return 'text-red-500';
    return 'text-green-500';
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={cn('relative w-48 h-48', isStale && 'opacity-50')}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            className="text-muted"
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={cn('transition-all duration-500', getColor())}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-4xl font-bold', getColor())}>
            {isNoData ? '--' : moisture}
          </span>
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>

      {isStale && lastSeenMinutes !== null && (
        <div className="text-sm text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full">
          Last seen {formatTimeAgo(lastSeenMinutes)}
        </div>
      )}

      {isNoData && (
        <div className="text-sm text-gray-500">
          No data yet. Use simulator to send a reading.
        </div>
      )}
    </div>
  );
}
