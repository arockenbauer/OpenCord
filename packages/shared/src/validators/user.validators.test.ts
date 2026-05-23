import { describe, expect, it } from 'vitest';
import { deleteUserSchema, updateUserSchema } from './user.validators';

describe('User validators', () => {
  describe('updateUserSchema', () => {
    it('accepts valid profile and preference updates', () => {
      const result = updateUserSchema.safeParse({
        username: 'johnny_watermelon',
        bio: 'Hello from OpenCord',
        banner_color: '#112233',
        locale: 'fr',
        theme: 'dark',
        status: 'online',
        custom_status_text: 'Working',
        custom_status_emoji: ':wave:',
        custom_status_expires_at: '2026-01-01T00:00:00.000Z',
        default_message_notifications: 1,
        explicit_content_filter: 2,
        allow_dms_from: 'friends',
        discriminator: '1234',
        global_name: 'Johnny',
        ignored: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('ignored');
      }
    });

    it('rejects invalid username, status and discriminator values', () => {
      expect(updateUserSchema.safeParse({ username: 'bad name' }).success).toBe(false);
      expect(updateUserSchema.safeParse({ status: 'busy' }).success).toBe(false);
      expect(updateUserSchema.safeParse({ discriminator: '12' }).success).toBe(false);
    });
  });

  describe('deleteUserSchema', () => {
    it('requires the current password', () => {
      expect(deleteUserSchema.safeParse({ password: 'Passw0rd!' }).success).toBe(true);
      expect(deleteUserSchema.safeParse({ password: '' }).success).toBe(false);
    });
  });
});
