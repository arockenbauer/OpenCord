import { generateSnowflake } from '../utils/snowflake.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

const SYSTEM_AUTHOR = {
  id: '0',
  username: 'System',
  discriminator: '0000',
  avatar: null,
  bot: true,
};

interface SystemMessageOptions {
  channelId: string;
  content: string;
  type?: number;
  recipientUserId?: string | null;
  guildId?: string | null;
}

export async function createAndDispatchSystemMessage({
  channelId,
  content,
  type = 20,
  recipientUserId = null,
  guildId = null,
}: SystemMessageOptions) {
  const msg = {
    id: generateSnowflake(),
    channel_id: channelId,
    author_id: '0',
    author: SYSTEM_AUTHOR,
    content,
    type,
    flags: 64,
    attachments: [],
    embeds: [],
    reactions: [],
    created_at: new Date().toISOString(),
    guild_id: guildId,
  };

  const io = getIO();
  if (io) {
    if (recipientUserId) {
      io.to(`user:${recipientUserId}`).emit(GatewayEvents.MESSAGE_CREATE, { message: msg });
    } else {
      io.to(`channel:${channelId}`).emit(GatewayEvents.MESSAGE_CREATE, { message: msg });
    }
  }

  return msg;
}
