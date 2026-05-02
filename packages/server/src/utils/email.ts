import nodemailer from 'nodemailer';

const FROM = process.env.EMAIL_FROM || 'OpenCord <noreply@opencord.local>';

function createTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return null;
}

export async function sendPasswordResetEmail(email: string, token: string, username: string): Promise<void> {
  const resetUrl = `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL DEV] Password reset for ${email}: ${resetUrl}`);
    return;
  }

  const transporter = createTransporter();
  if (!transporter) return;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Reset your OpenCord password',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>Hi ${username},</p>
        <p>You requested a password reset. Click the link below (expires in 1 hour):</p>
        <p><a href="${resetUrl}" style="background: #5865F2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
        <p>Or copy this URL: ${resetUrl}</p>
        <p>If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

export async function sendVerificationEmail(email: string, token: string, username: string): Promise<void> {
  const verifyUrl = `${process.env.APP_URL || 'http://localhost:5173'}/verify-email?token=${token}`;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL DEV] Email verification for ${email}: ${verifyUrl}`);
    return;
  }

  const transporter = createTransporter();
  if (!transporter) return;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Verify your OpenCord email',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Verify your email</h2>
        <p>Hi ${username},</p>
        <p>Click the link below to verify your email address:</p>
        <p><a href="${verifyUrl}" style="background: #5865F2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Verify Email</a></p>
        <p>Or copy this URL: ${verifyUrl}</p>
      </div>
    `,
  });
}

export async function sendPremiumConfirmEmail(email: string, username: string, tierName: string): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL DEV] Premium activated for ${email}: tier ${tierName}`);
    return;
  }

  const transporter = createTransporter();
  if (!transporter) return;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Welcome to OpenCord+!',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Premium Activated!</h2>
        <p>Hi ${username},</p>
        <p>Your OpenCord+ subscription (${tierName}) is now active. Enjoy your premium features!</p>
      </div>
    `,
  });
}
