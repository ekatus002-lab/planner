import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthPage from './page';

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    auth: { signInWithOtp, verifyOtp },
  }),
}));

describe('AuthPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requests a code and advances to the code step on success', async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));

    expect(await screen.findByLabelText('Код из письма')).toBeInTheDocument();
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'me@example.com',
        options: expect.objectContaining({ shouldCreateUser: false }),
      }),
    );
  });

  it('surfaces a blocking error and stays on the email step when the request fails', async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: 'Signups not allowed for otp' },
    });
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Email'), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/не удалось отправить код/i);
    expect(screen.queryByLabelText('Код из письма')).not.toBeInTheDocument();
  });

  it('surfaces a blocking error when the entered code is wrong', async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    verifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token has expired or is invalid' } });
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));
    await user.type(await screen.findByLabelText('Код из письма'), '000000');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/неверный или устаревший код/i);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'me@example.com',
      token: '000000',
      type: 'email',
    });
  });
});
