import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PowerSyncSystemProvider } from '@/lib/powersync/system-provider';
import { AppShell } from '@/components/app-shell/app-shell';

export default async function PlannerPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect('/auth');
  }

  return (
    <PowerSyncSystemProvider>
      <AppShell userId={data.claims.sub} />
    </PowerSyncSystemProvider>
  );
}
