import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();

  redirect(data?.claims ? '/planner' : '/auth');
}
