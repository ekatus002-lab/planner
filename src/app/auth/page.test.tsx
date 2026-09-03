import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthPage from './page';

const signInWithOtp = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    auth: { signInWithOtp },
  }),
}));

describe('AuthPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the success message when the magic link request succeeds', async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить ссылку' }));

    expect(
      await screen.findByText('Мы отправили ссылку для входа на вашу почту. Проверьте письмо.'),
    ).toBeInTheDocument();
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'me@example.com',
        options: expect.objectContaining({ shouldCreateUser: false }),
      }),
    );
  });

  it('surfaces a blocking error and never shows the success message when the request fails', async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: 'Signups not allowed for otp' },
    });
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Email'), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить ссылку' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/не удалось отправить ссылку/i);
    expect(
      screen.queryByText('Мы отправили ссылку для входа на вашу почту. Проверьте письмо.'),
    ).not.toBeInTheDocument();
  });
});
