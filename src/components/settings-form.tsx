'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Settings } from '@/lib/types';

interface SettingsFormProps {
  initialSettings?: Settings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [settings, setSettings] = useState<Settings>(initialSettings ?? {
    threshold: 40,
    intervalMin: 5,
    pumpSec: 5,
    commandPollSec: 30,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        toast.success('Settings saved');
      } else {
        let errMsg = 'Failed to save settings';
        try {
          const err = await res.json();
          errMsg = err.error || errMsg;
        } catch (parseErr) {
          console.error('Failed to parse error response:', parseErr);
        }
        toast.error(errMsg);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="threshold">Moisture Threshold: {settings.threshold}%</Label>
        <Slider
          id="threshold"
          min={0}
          max={100}
          step={1}
          value={[settings.threshold]}
          onValueChange={([v]) => setSettings((s) => ({ ...s, threshold: v }))}
        />
        <p className="text-sm text-muted-foreground">
          Pump will trigger when moisture falls below this value.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="intervalMin">Reading Interval (minutes)</Label>
        <Input
          id="intervalMin"
          type="number"
          min={1}
          max={30}
          value={settings.intervalMin}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            setSettings((s) => ({ ...s, intervalMin: isNaN(val) ? s.intervalMin : val }));
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pumpSec">Pump Duration (seconds)</Label>
        <Input
          id="pumpSec"
          type="number"
          min={1}
          max={60}
          value={settings.pumpSec}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            setSettings((s) => ({ ...s, pumpSec: isNaN(val) ? s.pumpSec : val }));
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="commandPollSec">Command Poll Interval (seconds)</Label>
        <Input
          id="commandPollSec"
          type="number"
          min={5}
          max={300}
          value={settings.commandPollSec}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            setSettings((s) => ({ ...s, commandPollSec: isNaN(val) ? s.commandPollSec : val }));
          }}
        />
        <p className="text-sm text-muted-foreground">
          How often Arduino checks for manual pump triggers (5–300 sec).
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Save Settings'}
      </Button>
    </form>
  );
}
