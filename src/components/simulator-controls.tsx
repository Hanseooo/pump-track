'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface SimulatorControlsProps {
  onReadingSent?: () => void;
}

export function SimulatorControls({ onReadingSent }: SimulatorControlsProps) {
  const [moisture, setMoisture] = useState<string>('50');
  const [autoSimulate, setAutoSimulate] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendReading = useCallback(async (value: number) => {
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moisture: value }),
      });
      if (!res.ok) throw new Error('Failed to send reading');
      onReadingSent?.();
    } catch (err) {
      console.error('Simulator error:', err);
    }
  }, [onReadingSent]);

  const handleManualSend = () => {
    const val = parseInt(moisture);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      sendReading(val);
    }
  };

  const handleRandomSend = () => {
    const val = Math.floor(Math.random() * 101);
    setMoisture(val.toString());
    sendReading(val);
  };

  useEffect(() => {
    if (autoSimulate) {
      intervalRef.current = setInterval(() => {
        const val = Math.floor(Math.random() * 101);
        setMoisture(val.toString());
        sendReading(val);
      }, 60000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoSimulate, sendReading]);

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <h3 className="font-semibold">Simulator</h3>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Label htmlFor="moisture-input">Moisture (%)</Label>
          <Input
            id="moisture-input"
            type="number"
            min={0}
            max={100}
            value={moisture}
            onChange={(e) => setMoisture(e.target.value)}
          />
        </div>
        <Button onClick={handleManualSend} className="mt-6">
          Send Reading
        </Button>
        <Button onClick={handleRandomSend} variant="outline" className="mt-6">
          Random
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="auto-sim"
          checked={autoSimulate}
          onCheckedChange={setAutoSimulate}
        />
        <Label htmlFor="auto-sim">
          Auto-simulate every 60s
        </Label>
      </div>
    </div>
  );
}
