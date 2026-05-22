import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents, PERMISSION_BITS } from '@opencord/shared';
import { getChannelPermissions } from '../controllers/message.controller.js';
import { checkPermission, getMemberPermissions, requireMembership } from '../controllers/guild.controller.js';
import { serializeBigInt } from '../utils/serialize.js';
import { closeUserMedia } from './voice-media.service.js';

export interface VoiceStatePatch {
  channel_id?: string | null;
  channelId?: string | null;
  self_mute?: boolean;
  selfMute?: boolean;
  self_deaf?: boolean;
  selfDeaf?: boolean;
  self_video?: boolean;
  selfVideo?: boolean;
  suppress?: boolean;
}

const VOICE_CHANNEL_TYPES = [2, 13, 14];

function readChannelId(patch: VoiceStatePatch): string | null | undefined {
  if (patch.channel_id !== undefined) return patch.channel_id;
  if (patch.channelId !== undefined) return patch.channelId;
  return undefined;
}

function readBoolean(patch: VoiceStatePatch, snake: keyof VoiceStatePatch, camel: keyof VoiceStatePatch): boolean | undefined {
  const value = patch[snake] ?? patch[camel];
  return typeof value === 'boolean' ? value : undefined;
}

async function emitVoiceState(guildId: string, payload: unknown): Promise<void> {
  const io = getIO();
  if (io) io.to(`guild:${guildId}`).emit(GatewayEvents.VOICE_STATE_UPDATE, serializeBigInt(payload));
}

export async function listVoiceStates(guildId: string) {
  return prisma.voiceState.findMany({
    where: { guild_id: guildId },
    include: {
      user: { select: { id: true, username: true, discriminator: true, avatar: true, global_name: true, status: true } },
    },
    orderBy: { updated_at: 'desc' },
  });
}

export async function updateOwnVoiceState(guildId: string, userId: string, patch: VoiceStatePatch, sessionId?: string) {
  await requireMembership(guildId, userId);

  const requestedChannelId = readChannelId(patch);
  const previous = await prisma.voiceState.findUnique({
    where: { guild_id_user_id: { guild_id: guildId, user_id: userId } },
  });

  if (requestedChannelId === null) {
    await prisma.voiceState.deleteMany({ where: { guild_id: guildId, user_id: userId } });
    if (previous?.channel_id) closeUserMedia(previous.channel_id, userId);
    const payload = {
      guild_id: guildId,
      user_id: userId,
      channel_id: null,
      session_id: previous?.session_id || sessionId || null,
      deaf: previous?.deaf ?? false,
      mute: previous?.mute ?? false,
      self_deaf: previous?.self_deaf ?? false,
      self_mute: previous?.self_mute ?? false,
      self_video: false,
      suppress: previous?.suppress ?? false,
    };
    await emitVoiceState(guildId, payload);
    return payload;
  }

  if (requestedChannelId !== undefined) {
    const channel = await prisma.channel.findFirst({
      where: { id: requestedChannelId, guild_id: guildId, type: { in: VOICE_CHANNEL_TYPES } },
    });
    if (!channel) throw new AppError(404, 'VOICE_CHANNEL_NOT_FOUND', 'Voice channel not found');

    const perms = await getChannelPermissions(channel.id, userId);
    checkPermission(perms, PERMISSION_BITS.VIEW_CHANNEL);
    checkPermission(perms, PERMISSION_BITS.CONNECT);

    if (channel.user_limit > 0) {
      const connectedCount = await prisma.voiceState.count({
        where: { guild_id: guildId, channel_id: channel.id, user_id: { not: userId } },
      });
      if (connectedCount >= channel.user_limit) {
        throw new AppError(403, 'VOICE_CHANNEL_FULL', 'Voice channel is full');
      }
    }

    if (previous?.channel_id && previous.channel_id !== channel.id) {
      closeUserMedia(previous.channel_id, userId);
    }
  }

  const channelId = requestedChannelId === undefined ? previous?.channel_id ?? null : requestedChannelId;
  if (!channelId) throw new AppError(400, 'MISSING_CHANNEL', 'channel_id is required');

  const state = await prisma.voiceState.upsert({
    where: { guild_id_user_id: { guild_id: guildId, user_id: userId } },
    create: {
      id: generateSnowflake(),
      guild_id: guildId,
      user_id: userId,
      channel_id: channelId,
      session_id: sessionId || generateSnowflake(),
      self_mute: readBoolean(patch, 'self_mute', 'selfMute') ?? false,
      self_deaf: readBoolean(patch, 'self_deaf', 'selfDeaf') ?? false,
      self_video: readBoolean(patch, 'self_video', 'selfVideo') ?? false,
      suppress: patch.suppress ?? false,
      updated_at: new Date(),
    },
    update: {
      channel_id: channelId,
      session_id: sessionId || previous?.session_id || generateSnowflake(),
      self_mute: readBoolean(patch, 'self_mute', 'selfMute') ?? previous?.self_mute ?? false,
      self_deaf: readBoolean(patch, 'self_deaf', 'selfDeaf') ?? previous?.self_deaf ?? false,
      self_video: readBoolean(patch, 'self_video', 'selfVideo') ?? previous?.self_video ?? false,
      suppress: patch.suppress ?? previous?.suppress ?? false,
      updated_at: new Date(),
    },
  });

  await emitVoiceState(guildId, state);
  return state;
}

export async function updateModeratedVoiceState(guildId: string, actorId: string, targetUserId: string, patch: VoiceStatePatch & { mute?: boolean; deaf?: boolean }) {
  await requireMembership(guildId, actorId);
  await requireMembership(guildId, targetUserId);
  const actorPerms = await getMemberPermissions(guildId, actorId);

  const requestedChannelId = readChannelId(patch);
  if (requestedChannelId !== undefined) checkPermission(actorPerms, PERMISSION_BITS.MOVE_MEMBERS);
  if (patch.mute !== undefined) checkPermission(actorPerms, PERMISSION_BITS.MUTE_MEMBERS);
  if (patch.deaf !== undefined) checkPermission(actorPerms, PERMISSION_BITS.DEAFEN_MEMBERS);

  const existing = await prisma.voiceState.findUnique({
    where: { guild_id_user_id: { guild_id: guildId, user_id: targetUserId } },
  });
  if (!existing && requestedChannelId === undefined) {
    throw new AppError(404, 'VOICE_STATE_NOT_FOUND', 'Voice state not found');
  }

  if (requestedChannelId === null) {
    await prisma.voiceState.deleteMany({ where: { guild_id: guildId, user_id: targetUserId } });
    if (existing?.channel_id) closeUserMedia(existing.channel_id, targetUserId);
    const payload = {
      guild_id: guildId,
      user_id: targetUserId,
      channel_id: null,
      session_id: existing?.session_id || null,
      deaf: patch.deaf ?? existing?.deaf ?? false,
      mute: patch.mute ?? existing?.mute ?? false,
      self_deaf: existing?.self_deaf ?? false,
      self_mute: existing?.self_mute ?? false,
      self_video: false,
      suppress: patch.suppress ?? existing?.suppress ?? false,
    };
    await emitVoiceState(guildId, payload);
    return payload;
  }

  const nextChannelId = requestedChannelId ?? existing?.channel_id;
  if (!nextChannelId) throw new AppError(400, 'MISSING_CHANNEL', 'channel_id is required');

  const channel = await prisma.channel.findFirst({
    where: { id: nextChannelId, guild_id: guildId, type: { in: VOICE_CHANNEL_TYPES } },
  });
  if (!channel) throw new AppError(404, 'VOICE_CHANNEL_NOT_FOUND', 'Voice channel not found');

  if (existing?.channel_id && existing.channel_id !== channel.id) {
    closeUserMedia(existing.channel_id, targetUserId);
  }

  const state = await prisma.voiceState.upsert({
    where: { guild_id_user_id: { guild_id: guildId, user_id: targetUserId } },
    create: {
      id: generateSnowflake(),
      guild_id: guildId,
      user_id: targetUserId,
      channel_id: channel.id,
      session_id: generateSnowflake(),
      mute: patch.mute ?? false,
      deaf: patch.deaf ?? false,
      suppress: patch.suppress ?? false,
      updated_at: new Date(),
    },
    update: {
      channel_id: channel.id,
      mute: patch.mute ?? existing?.mute ?? false,
      deaf: patch.deaf ?? existing?.deaf ?? false,
      suppress: patch.suppress ?? existing?.suppress ?? false,
      updated_at: new Date(),
    },
  });

  await emitVoiceState(guildId, state);
  return state;
}
