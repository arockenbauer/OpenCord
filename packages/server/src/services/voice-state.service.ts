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
    await checkPermission(perms, PERMISSION_BITS.VIEW_CHANNEL, guildId, userId);
    await checkPermission(perms, PERMISSION_BITS.CONNECT, guildId, userId);

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
  if (requestedChannelId !== undefined) await checkPermission(actorPerms, PERMISSION_BITS.MOVE_MEMBERS, guildId, actorId);
  if (patch.mute !== undefined) await checkPermission(actorPerms, PERMISSION_BITS.MUTE_MEMBERS, guildId, actorId);
  if (patch.deaf !== undefined) await checkPermission(actorPerms, PERMISSION_BITS.DEAFEN_MEMBERS, guildId, actorId);

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

// DM Call Functions
export async function initiateDMCall(dmChannelId: string, userId: string) {
  const dmChannel = await prisma.dMChannel.findUnique({
    where: { id: dmChannelId },
    include: { members: { include: { user: true } } },
  });
  if (!dmChannel) throw new AppError(404, 'DM_CHANNEL_NOT_FOUND', 'DM channel not found');
  if (dmChannel.type !== 1) throw new AppError(400, 'INVALID_DM_TYPE', 'DM calls only supported for 1-on-1 DMs');

  const member = dmChannel.members.find(m => m.user_id === userId);
  if (!member) throw new AppError(403, 'NOT_A_MEMBER', 'User is not a member of this DM channel');

  const existingCall = await prisma.voiceState.findFirst({
    where: { dm_channel_id: dmChannelId, call_status: { in: ['ringing', 'connected'] } },
  });
  if (existingCall) throw new AppError(400, 'CALL_ALREADY_ACTIVE', 'A call is already active in this DM');

  const callStatusId = generateSnowflake();
  await prisma.voiceState.create({
    data: {
      id: callStatusId,
      user_id: userId,
      dm_channel_id: dmChannelId,
      channel_id: dmChannelId,
      call_status: 'ringing',
      session_id: generateSnowflake(),
      self_mute: false,
      self_deaf: false,
      self_video: false,
      suppress: false,
      updated_at: new Date(),
    },
  });

  const io = getIO();
  if (io) {
    const caller = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, avatar: true } });
    for (const member of dmChannel.members) {
      if (member.user_id !== userId) {
        io.to(`user:${member.user_id}`).emit(GatewayEvents.DM_CALL_RING, {
          caller_id: userId,
          caller_name: caller?.username || 'Unknown',
          dm_channel_id: dmChannelId,
          timestamp: Date.now(),
        });
      }
    }
  }

  return { status: 'ringing', dm_channel_id: dmChannelId };
}

export async function answerDMCall(dmChannelId: string, userId: string, accept: boolean) {
  const voiceState = await prisma.voiceState.findFirst({
    where: { dm_channel_id: dmChannelId, call_status: 'ringing' },
  });
  if (!voiceState) throw new AppError(404, 'NO_RINGING_CALL', 'No ringing call found');

  const dmChannel = await prisma.dMChannel.findUnique({
    where: { id: dmChannelId },
    include: { members: true },
  });
  if (!dmChannel) throw new AppError(404, 'DM_CHANNEL_NOT_FOUND', 'DM channel not found');

  if (!accept) {
    await prisma.voiceState.deleteMany({ where: { dm_channel_id: dmChannelId } });
    const io = getIO();
    if (io) {
      for (const member of dmChannel.members) {
        io.to(`user:${member.user_id}`).emit(GatewayEvents.DM_CALL_DECLINE, {
          dm_channel_id: dmChannelId,
          user_id: userId,
        });
      }
    }
    return { status: 'declined' };
  }

  await prisma.voiceState.updateMany({
    where: { dm_channel_id: dmChannelId },
    data: { call_status: 'connected' },
  });

  const io = getIO();
  if (io) {
    io.to(`channel:${dmChannelId}`).emit(GatewayEvents.DM_CALL_ACCEPT, {
      dm_channel_id: dmChannelId,
      user_id: userId,
    });
  }

  return { status: 'connected', dm_channel_id: dmChannelId };
}

export async function endDMCall(dmChannelId: string, userId: string) {
  const voiceStates = await prisma.voiceState.findMany({
    where: { dm_channel_id: dmChannelId },
  });

  for (const state of voiceStates) {
    if (state.channel_id) closeUserMedia(state.channel_id, state.user_id);
  }

  await prisma.voiceState.deleteMany({ where: { dm_channel_id: dmChannelId } });

  const io = getIO();
  if (io) {
    io.to(`channel:${dmChannelId}`).emit(GatewayEvents.DM_CALL_END, {
      dm_channel_id: dmChannelId,
      user_id: userId,
    });
  }

  return { status: 'ended' };
}

export async function getDMCallState(dmChannelId: string) {
  return prisma.voiceState.findMany({
    where: { dm_channel_id: dmChannelId },
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });
}
