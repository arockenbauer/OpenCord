import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';
export const registerSchema = z.object({
    email: z.string().email().max(LIMITS.MAX_EMAIL_LENGTH),
    username: z
        .string()
        .min(LIMITS.MIN_USERNAME_LENGTH)
        .max(LIMITS.MAX_USERNAME_LENGTH)
        .regex(/^[a-zA-Z0-9_.\-]+$/),
    password: z
        .string()
        .min(LIMITS.MIN_PASSWORD_LENGTH)
        .max(LIMITS.MAX_PASSWORD_LENGTH)
        .regex(/[A-Z]/, 'Must contain uppercase')
        .regex(/[0-9]/, 'Must contain digit'),
    date_of_birth: z.string().refine((val) => {
        const dob = new Date(val);
        const now = new Date();
        const age = now.getFullYear() - dob.getFullYear();
        return age >= LIMITS.MIN_AGE;
    }, 'Must be at least 13 years old'),
});
export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});
export const refreshSchema = z.object({
    refresh_token: z.string().min(1),
});
export const logoutSchema = z.object({
    refresh_token: z.string().min(1),
});
export const twoFactorEnableSchema = z.object({
    password: z.string().min(1),
});
export const twoFactorVerifySchema = z.object({
    code: z.string().length(6),
});
export const twoFactorLoginSchema = z.object({
    code: z.string().min(1),
    partial_token: z.string().min(1),
});
export const forgotPasswordSchema = z.object({
    email: z.string().email(),
});
export const resetPasswordSchema = z.object({
    token: z.string().min(1),
    password: z
        .string()
        .min(LIMITS.MIN_PASSWORD_LENGTH)
        .max(LIMITS.MAX_PASSWORD_LENGTH)
        .regex(/[A-Z]/)
        .regex(/[0-9]/),
});
export const changePasswordSchema = z.object({
    old_password: z.string().min(1),
    new_password: z
        .string()
        .min(LIMITS.MIN_PASSWORD_LENGTH)
        .max(LIMITS.MAX_PASSWORD_LENGTH)
        .regex(/[A-Z]/)
        .regex(/[0-9]/),
});
//# sourceMappingURL=auth.validators.js.map