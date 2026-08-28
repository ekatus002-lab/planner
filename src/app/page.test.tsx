import { redirect } from 'next/navigation';
import Home from './page';

const getClaims = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getClaims },
  })),
}));

describe('Home', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /planner when the visitor has a session', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } } });

    await Home();

    expect(redirect).toHaveBeenCalledWith('/planner');
  });

  it('redirects to /auth when the visitor has no session', async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    await Home();

    expect(redirect).toHaveBeenCalledWith('/auth');
  });
});
