import { describe, expect, it } from 'vitest';
import {
  autoModRuleSchema,
  banUserSchema,
  createDMSchema,
  createInviteSchema,
  createRelationshipSchema,
} from './invite.validators';

describe('Invite and relationship validators', () => {
  describe('createInviteSchema', () => {
    it('applies defaults for invite creation', () => {
      const result = createInviteSchema.parse({});

      expect(result).toEqual({
        max_age: 86400,
        max_uses: 0,
        temporary: false,
        unique: true,
      });
    });

    it('rejects negative max age and max uses', () => {
      expect(createInviteSchema.safeParse({ max_age: -1 }).success).toBe(false);
      expect(createInviteSchema.safeParse({ max_uses: -1 }).success).toBe(false);
    });
  });

  describe('createRelationshipSchema', () => {
    it('accepts a valid username and discriminator', () => {
      expect(createRelationshipSchema.safeParse({ username: 'johnny', discriminator: '1234' }).success).toBe(true);
    });

    it('rejects an invalid discriminator', () => {
      expect(createRelationshipSchema.safeParse({ username: 'johnny', discriminator: 'abc' }).success).toBe(false);
    });
  });

  describe('createDMSchema', () => {
    it('accepts a single recipient or a group list', () => {
      expect(createDMSchema.safeParse({ recipient_id: 'user-1' }).success).toBe(true);
      expect(createDMSchema.safeParse({ recipient_ids: ['1', '2', '3'] }).success).toBe(true);
    });

    it('rejects groups above the recipient limit', () => {
      expect(createDMSchema.safeParse({ recipient_ids: Array.from({ length: 10 }, (_, index) => String(index)) }).success).toBe(false);
    });
  });

  describe('banUserSchema', () => {
    it('accepts valid moderation payloads', () => {
      expect(banUserSchema.safeParse({ reason: 'Spam', delete_message_seconds: 3600 }).success).toBe(true);
    });

    it('rejects deletions above the maximum window', () => {
      expect(banUserSchema.safeParse({ delete_message_seconds: 604801 }).success).toBe(false);
    });
  });

  describe('autoModRuleSchema', () => {
    it('accepts valid rules and fills defaults', () => {
      const result = autoModRuleSchema.parse({
        name: 'No spam',
        trigger_type: 1,
        actions: [{ type: 1 }],
      });

      expect(result.event_type).toBe(1);
      expect(result.enabled).toBe(true);
      expect(result.actions[0]?.metadata).toEqual({});
    });

    it('rejects invalid trigger and action types', () => {
      expect(autoModRuleSchema.safeParse({
        name: 'Bad rule',
        trigger_type: 0,
        actions: [{ type: 1 }],
      }).success).toBe(false);

      expect(autoModRuleSchema.safeParse({
        name: 'Bad rule',
        trigger_type: 1,
        actions: [{ type: 99 }],
      }).success).toBe(false);
    });
  });
});
