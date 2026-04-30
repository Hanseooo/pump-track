'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PumpStatus } from '@/lib/types';

interface PumpCardProps {
  status: PumpStatus;
  lastPump: { ts: number; trigger: 'auto' | 'manual' } | null;
  hasReading: boolean;
  onTrigger: () => Promise<void>;
}

export function PumpCard({ status, lastPump, hasReading, onTrigger }: PumpCardProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleTrigger = async () => {
    setLoading(true);
    try {
      await onTrigger();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const getStatusColor = (s: PumpStatus) => {
    switch (s) {
      case 'idle': return 'bg-gray-100 text-gray-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'running': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
    }
  };

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Pump Control</h2>
        <Badge className={getStatusColor(status)}>
          {status}
        </Badge>
      </div>

      {lastPump && (
        <p className="text-sm text-muted-foreground">
          Last triggered: {new Date(lastPump.ts).toLocaleString()} ({lastPump.trigger})
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button disabled={!hasReading || status === 'pending' || status === 'running'}>
            {!hasReading ? 'Waiting for first reading...' : 'Trigger Pump'}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Pump Trigger</DialogTitle>
            <DialogDescription>
              Are you sure you want to manually trigger the pump?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTrigger} disabled={loading}>
              {loading ? 'Triggering...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {status === 'error' && (
        <p className="text-sm text-red-600">
          Pump command expired. Please try again.
        </p>
      )}
    </div>
  );
}
