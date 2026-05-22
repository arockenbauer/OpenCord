import { describe, expect, it } from 'vitest';
import {
  createChannelSchema,
  createGuildSchema,
  deleteGuildSchema,
  updateChannelSchema,
  updateGuildSchema,
} from './guild.validators';

describe('Guild validators', () => {
  describe('createGuildSchema', () => {
    it('accepts a valid guild name', () => {
      expect(createGuildSchema.safeParse({ name: 'OpenCord' }).success).toBe(true);
    });

    it('rejects a name that is too short', () => {
      expect(createGuildSchema.safeParse({ name: 'A' }).success).toBe(false);
    });
  });

  describe('updateGuildSchema', () => {
    it('accepts valid guild settings', () => {
      const result = updateGuildSchema.safeParse({
        name: 'Updated Guild',
        description: 'A test guild',
        verification_level: 2,
        default_message_notifications: 1,
        explicit_content_filter: 2,
        system_channel_id: 'channel-1',
        system_channel_flags: 4,
        afk_channel_id: 'channel-2',
        afk_timeout: 300,
        preferred_locale: 'fr',
        vanity_url_code: 'opencord-test',
        invites_disabled: true,
        ignored: 'value',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('ignored');
      }
    });

    it('rejects an invalid vanity code', () => {
      expect(updateGuildSchema.safeParse({ vanity_url_code: 'no spaces allowed' }).success).toBe(false);
    });
  });

  describe('deleteGuildSchema', () => {
    it('requires a non-empty confirmation', () => {
      expect(deleteGuildSchema.safeParse({ confirmation: 'DELETE' }).success).toBe(true);
      expect(deleteGuildSchema.safeParse({ confirmation: '' }).success).toBe(false);
    });
  });

  describe('createChannelSchema', () => {
    it('accepts a valid channel definition', () => {
      expect(createChannelSchema.safeParse({
        name: 'general',
        type: 0,
        topic: 'General chat',
        slowmode_delay: 5,
        user_limit: 10,
      }).success).toBe(true);
    });

    it('rejects invalid slowmode and user limit values', () => {
      expect(createChannelSchema.safeParse({ name: 'general', type: 0, slowmode_delay: 21601 }).success).toBe(false);
      expect(createChannelSchema.safeParse({ name: 'general', type: 0, user_limit: 100 }).success).toBe(false);
    });
  });

  describe('updateChannelSchema', () => {
    it('accepts valid channel updates and strips unknown keys', () => {
      const result = updateChannelSchema.safeParse({
        name: 'announcements',
        topic: 'Important updates',
        nsfw: false,
        parent_id: null,
        ignored: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('ignored');
      }
    });

    it('rejects invalid topic length', () => {
      expect(updateChannelSchema.safeParse({ topic: 'x'.repeat(1025) }).success).toBe(false);
    });
  });
});
