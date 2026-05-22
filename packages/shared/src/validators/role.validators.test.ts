import { describe, expect, it } from 'vitest';
import {
  createRoleSchema,
  updateMemberSchema,
  updateRolePositionsSchema,
  updateRoleSchema,
} from './role.validators';

describe('Role validators', () => {
  describe('createRoleSchema', () => {
    it('accepts valid role creation payloads and strips unknown keys', () => {
      const result = createRoleSchema.safeParse({
        name: 'Moderators',
        color: '#FFAA00',
        hoist: true,
        mentionable: true,
        permissions: '8',
        ignored: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('ignored');
      }
    });

    it('rejects invalid hex colors', () => {
      expect(createRoleSchema.safeParse({ color: 'orange' }).success).toBe(false);
    });
  });

  describe('updateRoleSchema', () => {
    it('accepts nullable fields', () => {
      expect(updateRoleSchema.safeParse({ color: null, icon: null, unicode_emoji: null }).success).toBe(true);
    });

    it('rejects names longer than the max length', () => {
      expect(updateRoleSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
    });
  });

  describe('updateRolePositionsSchema', () => {
    it('accepts integer positions', () => {
      expect(updateRolePositionsSchema.safeParse([{ id: 'role-1', position: 1 }]).success).toBe(true);
    });

    it('rejects non-integer positions', () => {
      expect(updateRolePositionsSchema.safeParse([{ id: 'role-1', position: 1.5 }]).success).toBe(false);
    });
  });

  describe('updateMemberSchema', () => {
    it('accepts valid moderation updates', () => {
      expect(updateMemberSchema.safeParse({
        nickname: 'Johnny',
        roles: ['role-1'],
        communication_disabled_until: '2026-01-01T00:00:00.000Z',
        reason: 'Too loud',
      }).success).toBe(true);
    });

    it('rejects overly long moderation reasons', () => {
      expect(updateMemberSchema.safeParse({ reason: 'x'.repeat(513) }).success).toBe(false);
    });
  });
});
