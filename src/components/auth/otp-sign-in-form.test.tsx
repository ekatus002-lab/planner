import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OtpSignInForm } from './otp-sign-in-form';

describe('OtpSignInForm', () => {
  it('requests a code with a normalized email', async () => {
    const user = userEvent.setup();
    const onRequestCode = vi.fn().mockResolvedValue(true);
    const onVerifyCode = vi.fn();
    render(<OtpSignInForm onRequestCode={onRequestCode} onVerifyCode={onVerifyCode} />);

    await user.type(screen.getByLabelText('Email'), '  ME@example.com ');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));

    expect(onRequestCode).toHaveBeenCalledWith('me@example.com');
  });

  it('advances to the code step only when the request succeeds', async () => {
    const user = userEvent.setup();
    const onRequestCode = vi.fn().mockResolvedValue(true);
    const onVerifyCode = vi.fn();
    render(<OtpSignInForm onRequestCode={onRequestCode} onVerifyCode={onVerifyCode} />);

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));

    expect(await screen.findByLabelText('Код из письма')).toBeInTheDocument();
  });

  it('stays on the email step when the request fails', async () => {
    const user = userEvent.setup();
    const onRequestCode = vi.fn().mockResolvedValue(false);
    const onVerifyCode = vi.fn();
    render(<OtpSignInForm onRequestCode={onRequestCode} onVerifyCode={onVerifyCode} />);

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));

    expect(screen.queryByLabelText('Код из письма')).not.toBeInTheDocument();
  });

  it('submits the entered code with the same normalized email', async () => {
    const user = userEvent.setup();
    const onRequestCode = vi.fn().mockResolvedValue(true);
    const onVerifyCode = vi.fn().mockResolvedValue(undefined);
    render(<OtpSignInForm onRequestCode={onRequestCode} onVerifyCode={onVerifyCode} />);

    await user.type(screen.getByLabelText('Email'), '  ME@example.com ');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));
    await user.type(await screen.findByLabelText('Код из письма'), '123456');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(onVerifyCode).toHaveBeenCalledWith('me@example.com', '123456');
  });

  it('lets the user go back to the email step to correct it', async () => {
    const user = userEvent.setup();
    const onRequestCode = vi.fn().mockResolvedValue(true);
    const onVerifyCode = vi.fn();
    render(<OtpSignInForm onRequestCode={onRequestCode} onVerifyCode={onVerifyCode} />);

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));
    await screen.findByLabelText('Код из письма');
    await user.click(screen.getByRole('button', { name: 'Изменить email' }));

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByLabelText('Код из письма')).not.toBeInTheDocument();
  });
});
