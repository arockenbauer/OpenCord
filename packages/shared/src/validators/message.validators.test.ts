import { describe, expect, it } from 'vitest';
import {
  bulkDeleteSchema,
  createMessageSchema,
  editMessageSchema,
  getMessagesSchema,
  searchMessagesSchema,
} from './message.validators';

describe('Message validators', () => {
  describe('createMessageSchema', () => {
    it('accepts a valid rich message payload', () => {
      const result = createMessageSchema.safeParse({
        content: 'Hello world',
        tts: false,
        message_reference: {
          message_id: 'message-1',
          channel_id: 'channel-1',
          guild_id: 'guild-1',
        },
        sticker_ids: ['sticker-1'],
        flags: 0,
        embeds: [{
          title: 'Embed title',
          description: 'Embed description',
          url: 'https://example.com',
          timestamp: '2026-01-01T00:00:00.000Z',
          footer: { text: 'Footer' },
          image: { url: 'https://example.com/image.png' },
          thumbnail: { url: 'https://example.com/thumb.png' },
          author: { name: 'Author' },
          fields: [{ name: 'Field', value: 'Value', inline: true }],
        }],
        ignored: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('ignored');
      }
    });

    it('rejects oversized content and too many stickers', () => {
      expect(createMessageSchema.safeParse({ content: 'x'.repeat(2001) }).success).toBe(false);
      expect(createMessageSchema.safeParse({ sticker_ids: ['1', '2'] }).success).toBe(false);
    });
  });

  describe('editMessageSchema', () => {
    it('accepts message edits and strips unknown keys', () => {
      const result = editMessageSchema.safeParse({ content: 'Edited', flags: 4, ignored: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('ignored');
      }
    });

    it('rejects content over the max length', () => {
      expect(editMessageSchema.safeParse({ content: 'x'.repeat(2001) }).success).toBe(false);
    });
  });

  describe('bulkDeleteSchema', () => {
    it('accepts ids within the allowed range', () => {
      expect(bulkDeleteSchema.safeParse({ ids: ['1', '2'] }).success).toBe(true);
    });

    it('rejects empty payloads and too many ids', () => {
      expect(bulkDeleteSchema.safeParse({ ids: [] }).success).toBe(false);
      expect(bulkDeleteSchema.safeParse({ ids: Array.from({ length: 101 }, (_, index) => `${index}`) }).success).toBe(false);
    });
  });

  describe('getMessagesSchema', () => {
    it('applies defaults and coerces limits', () => {
      expect(getMessagesSchema.parse({})).toEqual({ limit: 50 });
      expect(getMessagesSchema.parse({ limit: '10' })).toEqual({ limit: 10 });
    });

    it('rejects limits outside the accepted range', () => {
      expect(getMessagesSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(getMessagesSchema.safeParse({ limit: 101 }).success).toBe(false);
    });
  });

  describe('searchMessagesSchema', () => {
    it('accepts valid search filters and coerces pagination', () => {
      const result = searchMessagesSchema.parse({
        q: 'hello',
        from: 'user-1',
        has: 'image',
        during: '2026-05',
        pinned: 'true',
        limit: '10',
        offset: '2',
      });

      expect(result.limit).toBe(10);
      expect(result.offset).toBe(2);
    });

    it('rejects invalid date and pagination values', () => {
      expect(searchMessagesSchema.safeParse({ during: '2026-5' }).success).toBe(false);
      expect(searchMessagesSchema.safeParse({ limit: 26 }).success).toBe(false);
      expect(searchMessagesSchema.safeParse({ offset: -1 }).success).toBe(false);
    });
  });
});
