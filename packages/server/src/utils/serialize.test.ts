import { describe, expect, it } from 'vitest';
import { serializeUser, serializeGuild, serializeMessage } from './serialize.js';

describe('serializeUser', () => {
  it('serializes user object correctly', () => {
    const user = {
      id: 'user-1',
      username: 'john',
      discriminator: '1234',
      email: 'john@example.com',
      avatar: 'avatar.png',
      banner: null,
      bio: 'Hello!',
      global_name: 'John',
      status: 'online',
      custom_status_text: 'Coding',
      locale: 'en',
      theme: 'dark',
      admin_level: 0,
      two_factor_enabled: true,
      premium: false,
      created_at: new Date('2024-01-01'),
      bot: false,
    };
    const serialized = serializeUser(user);
    expect(serialized.id).toBe('user-1');
    expect(serialized.username).toBe('john');
    expect(serialized.email).toBeUndefined();
    expect(serialized.bot).toBe(false);
  });

  it('excludes sensitive fields for non-self', () => {
    const user = {
      id: 'user-1',
      username: 'john',
      email: 'john@example.com',
      two_factor_enabled: true,
    };
    const serialized = serializeUser(user, false);
    expect(serialized.email).toBeUndefined();
    expect(serialized.two_factor_enabled).toBeUndefined();
  });
});

describe('serializeGuild', () => {
  it('serializes guild object correctly', () => {
    const guild = {
      id: 'guild-1',
      name: 'Test Guild',
      icon: 'icon.png',
      owner_id: 'owner-1',
      created_at: new Date(),
    };
    const serialized = serializeGuild(guild);
    expect(serialized.id).toBe('guild-1');
    expect(serialized.name).toBe('Test Guild');
  });
});

describe('serializeMessage', () => {
  it('serializes message with attachments', () => {
    const message = {
      id: 'msg-1',
      content: 'Hello!',
      author_id: 'user-1',
      channel_id: 'chan-1',
      created_at: new Date(),
      edited_at: null,
      author: { id: 'user-1', username: 'john', discriminator: '1234' },
      attachments: [{ id: 'att-1', filename: 'file.png', size: 1024 }],
    };
    const serialized = serializeMessage(message);
    expect(serialized.id).toBe('msg-1');
    expect(serialized.content).toBe('Hello!');
    expect(serialized.attachments).toHaveLength(1);
  });
});
