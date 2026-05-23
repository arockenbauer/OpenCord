import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  nodemailer: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    })),
  },
  logger: {
    logError: vi.fn(),
    logInfo: vi.fn(),
  },
}));

vi.mock('nodemailer', () => mocks.nodemailer);
vi.mock('./logger.js', () => mocks.logger);

import { sendEmail } from './email.js';

describe('email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = '[EMAIL]';
  });

  it('sends email successfully when SMTP is configured', async () => {
    await expect(sendEmail({
      to: '[EMAIL]',
      subject: 'Test',
      html: '<p>Hello</p>',
    })).resolves.not.toThrow();

    expect(mocks.nodemailer.createTransport).toHaveBeenCalled();
    expect(mocks.logger.logInfo).toHaveBeenCalledWith(
      expect.stringContaining('Email sent'),
      expect.any(Object)
    );
  });

  it('skips sending when SMTP is not configured', async () => {
    delete process.env.SMTP_HOST;
    await sendEmail({ to: '[EMAIL]', subject: 'Test', html: '<p>Hello</p>' });
    expect(mocks.nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('logs error when sending fails', async () => {
    const transport = { sendMail: vi.fn().mockRejectedValue(new Error('SMTP error')) };
    mocks.nodemailer.createTransport.mockReturnValue(transport);

    await expect(sendEmail({
      to: '[EMAIL]',
      subject: 'Test',
      html: '<p>Hello</p>',
    })).rejects.toThrow('SMTP error');

    expect(mocks.logger.logError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send email'),
      expect.any(Object)
    );
  });

  it('handles text-only emails', async () => {
    await sendEmail({ to: '[EMAIL]', subject: 'Test', text: 'Hello' });
    expect(mocks.nodemailer.createTransport).toHaveBeenCalled();
  });
});
