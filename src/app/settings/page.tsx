import { SettingsForm } from '@/components/settings-form';
import { getSettings } from '@/lib/services/irrigation-service';

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <main className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      <SettingsForm initialSettings={settings} />
    </main>
  );
}
