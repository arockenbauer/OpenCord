import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  twoFactorEnableSchema,
  twoFactorLoginSchema,
  twoFactorVerifySchema,
} from './auth.validators';

describe('Auth Validators', () => {
  describe('registerSchema', () => {
    it('should validate valid registration data', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'testuser',
        password: 'Password123!',
        date_of_birth: '1990-01-01',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = registerSchema.safeParse({
        email: 'invalid',
        username: 'testuser',
        password: 'Password123!',
        date_of_birth: '1990-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('should reject users younger than the minimum age', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'testuser',
        password: 'Password123!',
        date_of_birth: new Date().toISOString().slice(0, 10),
      });

      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('should validate valid login data', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'Password123!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject an empty password', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: '',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('refreshSchema', () => {
    it('requires a refresh token', () => {
      expect(refreshSchema.safeParse({ refresh_token: 'token' }).success).toBe(true);
      expect(refreshSchema.safeParse({ refresh_token: '' }).success).toBe(false);
    });
  });

  describe('logoutSchema', () => {
    it('requires a refresh token', () => {
      expect(logoutSchema.safeParse({ refresh_token: 'token' }).success).toBe(true);
      expect(logoutSchema.safeParse({ refresh_token: '' }).success).toBe(false);
    });
  });

  describe('twoFactorEnableSchema', () => {
    it('requires the current password', () => {
      expect(twoFactorEnableSchema.safeParse({ password: 'Password123!' }).success).toBe(true);
      expect(twoFactorEnableSchema.safeParse({ password: '' }).success).toBe(false);
    });
  });

  describe('twoFactorVerifySchema', () => {
    it('requires a 6-digit code', () => {
      expect(twoFactorVerifySchema.safeParse({ code: '123456' }).success).toBe(true);
      expect(twoFactorVerifySchema.safeParse({ code: '12345' }).success).toBe(false);
    });
  });

  describe('twoFactorLoginSchema', () => {
    it('requires both partial token and code', () => {
      expect(twoFactorLoginSchema.safeParse({ code: '123456', partial_token: 'partial' }).success).toBe(true);
      expect(twoFactorLoginSchema.safeParse({ code: '', partial_token: 'partial' }).success).toBe(false);
    });
  });

  describe('forgotPasswordSchema', () => {
    it('validates email format', () => {
      expect(forgotPasswordSchema.safeParse({ email: 'test@example.com' }).success).toBe(true);
      expect(forgotPasswordSchema.safeParse({ email: 'invalid' }).success).toBe(false);
    });
  });

  describe('resetPasswordSchema', () => {
    it('accepts a strong password and token', () => {
      expect(resetPasswordSchema.safeParse({ token: 'reset-token', password: 'Password123!' }).success).toBe(true);
    });

    it('rejects passwords without uppercase or digits', () => {
      expect(resetPasswordSchema.safeParse({ token: 'reset-token', password: 'password123!' }).success).toBe(false);
      expect(resetPasswordSchema.safeParse({ token: 'reset-token', password: 'Password!!!' }).success).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    it('accepts valid current and next passwords', () => {
      expect(changePasswordSchema.safeParse({
        old_password: 'OldPassw0rd!',
        new_password: 'NewPassw0rd!',
      }).success).toBe(true);
    });

    it('rejects a weak new password', () => {
      expect(changePasswordSchema.safeParse({
        old_password: 'OldPassw0rd!',
        new_password: 'weakpass',
      }).success).toBe(false);
    });
  });
});
