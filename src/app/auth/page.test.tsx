import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthPage from './page';

const signInWithPassword = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    auth: { signInWithPassword },
  }),
}));

describe('AuthPage', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_OWNER_EMAIL', 'owner@example.com');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('never renders an email field', () => {
    render(<AuthPage />);

    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.getByLabelText('PIN-код')).toBeInTheDocument();
  });

  it('signs in with the fixed owner email and the entered PIN', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByLabelText('PIN-код'), '682337');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: '682337',
    });
  });

  it('shows a blocking error for a wrong PIN', async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    });
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByLabelText('PIN-код'), '000000');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/неверный pin/i);
  });
});
