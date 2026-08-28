import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function PlannerPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect('/auth');
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <h1 className="text-2xl font-semibold">Мой планер</h1>
    </main>
  );
}
