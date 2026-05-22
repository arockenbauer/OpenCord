import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents, PERMISSION_BITS } from '@opencord/shared';
import { checkPermission, getMemberPermissions, requireMembership } from './guild.controller.js';
import { getChannelPermissions } from './message.controller.js';
import { listVoiceStates, updateModeratedVoiceState, updateOwnVoiceState } from '../services/voice-state.service.js';
import { serializeBigInt } from '../utils/serialize.js';
import { sanitizeFilename } from '../middleware/upload.middleware.js';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

export async function getVoiceStates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);
    const states = await listVoiceStates(req.params.guildId);
    res.json({ voice_states: serializeBigInt(states) });
  } catch (err) {
    next(err);
  }
}

export async function getMyVoiceState(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);
    const state = await prisma.voiceState.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.user!.userId } },
    });
    res.json({ voice_state: serializeBigInt(state) });
  } catch (err) {
    next(err);
  }
}

export async function patchMyVoiceState(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const state = await updateOwnVoiceState(req.params.guildId, req.user!.userId, req.body);
    res.json({ voice_state: serializeBigInt(state) });
  } catch (err) {
    next(err);
  }
}

export async function patchUserVoiceState(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const state = await updateModeratedVoiceState(req.params.guildId, req.user!.userId, req.params.userId, req.body);
    res.json({ voice_state: serializeBigInt(state) });
  } catch (err) {
    next(err);
  }
}

export async function createStageInstance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { channelId, channel_id, topic, privacyLevel, privacy_level } = req.body;
    const targetChannelId = channelId || channel_id;
    if (!targetChannelId || !topic) throw new AppError(400, 'MISSING_FIELD', 'channelId and topic are required');

    const channel = await prisma.channel.findFirst({
      where: { id: targetChannelId, guild_id: req.params.guildId || undefined, type: 14 },
    });
    if (!channel) throw new AppError(404, 'STAGE_CHANNEL_NOT_FOUND', 'Stage channel not found');
    const guildId = req.params.guildId || channel.guild_id;
    if (!guildId) throw new AppError(400, 'INVALID_CHANNEL', 'Stage channel must belong to a guild');

    const perms = await getChannelPermissions(channel.id, req.user!.userId);
    if ((perms & PERMISSION_BITS.MUTE_MEMBERS) === 0n && (perms & PERMISSION_BITS.MOVE_MEMBERS) === 0n && (perms & PERMISSION_BITS.ADMINISTRATOR) === 0n) {
      throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
    }

    const stage = await prisma.stageInstance.create({
      data: {
        id: generateSnowflake(),
        channel_id: channel.id,
        guild_id: guildId,
        topic,
        privacy_level: privacyLevel ?? privacy_level ?? 1,
      },
    });
    getIO()?.to(`guild:${guildId}`).emit(GatewayEvents.STAGE_INSTANCE_CREATE, stage);
    res.status(201).json(stage);
  } catch (err) {
    next(err);
  }
}

export async function getStageInstance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stage = await prisma.stageInstance.findUnique({ where: { channel_id: req.params.channelId } });
    if (!stage || (req.params.guildId && stage.guild_id !== req.params.guildId)) throw new AppError(404, 'STAGE_INSTANCE_NOT_FOUND', 'Stage instance not found');
    await requireMembership(stage.guild_id, req.user!.userId);
    res.json(stage);
  } catch (err) {
    next(err);
  }
}

export async function updateStageInstance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stage = await prisma.stageInstance.findUnique({ where: { channel_id: req.params.channelId } });
    if (!stage || (req.params.guildId && stage.guild_id !== req.params.guildId)) throw new AppError(404, 'STAGE_INSTANCE_NOT_FOUND', 'Stage instance not found');

    const perms = await getMemberPermissions(stage.guild_id, req.user!.userId);
    if ((perms & PERMISSION_BITS.MUTE_MEMBERS) === 0n && (perms & PERMISSION_BITS.MOVE_MEMBERS) === 0n && (perms & PERMISSION_BITS.ADMINISTRATOR) === 0n) {
      throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
    }

    const updated = await prisma.stageInstance.update({
      where: { channel_id: req.params.channelId },
      data: {
        topic: req.body.topic ?? stage.topic,
        privacy_level: req.body.privacyLevel ?? req.body.privacy_level ?? stage.privacy_level,
      },
    });
    getIO()?.to(`guild:${stage.guild_id}`).emit(GatewayEvents.STAGE_INSTANCE_UPDATE, updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteStageInstance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stage = await prisma.stageInstance.findUnique({ where: { channel_id: req.params.channelId } });
    if (!stage || (req.params.guildId && stage.guild_id !== req.params.guildId)) throw new AppError(404, 'STAGE_INSTANCE_NOT_FOUND', 'Stage instance not found');
    const perms = await getMemberPermissions(stage.guild_id, req.user!.userId);
    if ((perms & PERMISSION_BITS.MUTE_MEMBERS) === 0n && (perms & PERMISSION_BITS.MOVE_MEMBERS) === 0n && (perms & PERMISSION_BITS.ADMINISTRATOR) === 0n) {
      throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
    }
    await prisma.stageInstance.delete({ where: { channel_id: req.params.channelId } });
    getIO()?.to(`guild:${stage.guild_id}`).emit(GatewayEvents.STAGE_INSTANCE_DELETE, { guild_id: stage.guild_id, channel_id: req.params.channelId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

type SoundboardSoundRow = {
  id: string;
  guild_id: string | null;
  name: string;
  emoji: string | null;
  file_path: string;
  mime_type: string;
  volume: number;
  available: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getSoundboardSounds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);
    const sounds = await prisma.$queryRaw<SoundboardSoundRow[]>`
      SELECT * FROM SoundboardSound
      WHERE (guild_id = ${req.params.guildId} OR guild_id IS NULL) AND available = true
      ORDER BY guild_id IS NULL DESC, name ASC
    `;
    res.json({ sounds });
  } catch (err) {
    next(err);
  }
}

export async function createSoundboardSound(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, PERMISSION_BITS.MANAGE_EMOJIS_AND_STICKERS);
    if (!req.file) throw new AppError(400, 'NO_FILE', 'No sound file uploaded');

    const id = generateSnowflake();
    const name = String(req.body.name || path.basename(req.file.originalname, path.extname(req.file.originalname))).slice(0, 32);
    const safeName = sanitizeFilename(name || id);
    const ext = path.extname(req.file.originalname).toLowerCase() || '.ogg';
    const soundDir = path.join(uploadDir, 'soundboard', req.params.guildId);
    fs.mkdirSync(soundDir, { recursive: true });
    const fileName = `${id}-${safeName}${ext}`;
    const finalPath = path.join(soundDir, fileName);
    fs.renameSync(req.file.path, finalPath);

    const filePath = `/uploads/soundboard/${req.params.guildId}/${fileName}`;
    await prisma.$executeRaw`
      INSERT INTO SoundboardSound (id, guild_id, name, emoji, file_path, mime_type, volume, available, created_by)
      VALUES (${id}, ${req.params.guildId}, ${name}, ${req.body.emoji || null}, ${filePath}, ${req.file.mimetype}, ${Number(req.body.volume || 1)}, true, ${req.user!.userId})
    `;
    const rows = await prisma.$queryRaw<SoundboardSoundRow[]>`SELECT * FROM SoundboardSound WHERE id = ${id} LIMIT 1`;
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateSoundboardSound(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, PERMISSION_BITS.MANAGE_EMOJIS_AND_STICKERS);
    const rows = await prisma.$queryRaw<SoundboardSoundRow[]>`SELECT * FROM SoundboardSound WHERE id = ${req.params.soundId} AND guild_id = ${req.params.guildId} LIMIT 1`;
    const existing = rows[0];
    if (!existing) throw new AppError(404, 'SOUND_NOT_FOUND', 'Sound not found');
    const name = req.body.name !== undefined ? String(req.body.name).slice(0, 32) : existing.name;
    const emoji = req.body.emoji !== undefined ? req.body.emoji : existing.emoji;
    const volume = req.body.volume !== undefined ? Number(req.body.volume) : existing.volume;
    const available = req.body.available !== undefined ? Boolean(req.body.available) : existing.available;
    await prisma.$executeRaw`
      UPDATE SoundboardSound
      SET name = ${name}, emoji = ${emoji}, volume = ${volume}, available = ${available}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${existing.id}
    `;
    const updated = await prisma.$queryRaw<SoundboardSoundRow[]>`SELECT * FROM SoundboardSound WHERE id = ${existing.id} LIMIT 1`;
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteSoundboardSound(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, PERMISSION_BITS.MANAGE_EMOJIS_AND_STICKERS);
    const rows = await prisma.$queryRaw<SoundboardSoundRow[]>`SELECT * FROM SoundboardSound WHERE id = ${req.params.soundId} AND guild_id = ${req.params.guildId} LIMIT 1`;
    const existing = rows[0];
    if (!existing) throw new AppError(404, 'SOUND_NOT_FOUND', 'Sound not found');
    await prisma.$executeRaw`DELETE FROM SoundboardSound WHERE id = ${existing.id}`;
    const absolutePath = path.resolve(uploadDir, existing.file_path.replace(/^\/uploads\//, ''));
    const root = path.resolve(uploadDir);
    if (absolutePath.startsWith(root) && fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function playSoundboardSound(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);
    const rows = await prisma.$queryRaw<SoundboardSoundRow[]>`
      SELECT * FROM SoundboardSound
      WHERE id = ${req.params.soundId} AND (guild_id = ${req.params.guildId} OR guild_id IS NULL) AND available = true
      LIMIT 1
    `;
    const sound = rows[0];
    if (!sound) throw new AppError(404, 'SOUND_NOT_FOUND', 'Sound not found');

    const state = await prisma.voiceState.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.user!.userId } },
    });
    const channelId = req.body.channelId || req.body.channel_id || state?.channel_id;
    if (!channelId || state?.channel_id !== channelId) {
      throw new AppError(403, 'NOT_IN_VOICE_CHANNEL', 'You must be connected to this voice channel');
    }

    const perms = await getChannelPermissions(channelId, req.user!.userId);
    checkPermission(perms, PERMISSION_BITS.CONNECT);

    getIO()?.to(`guild:${req.params.guildId}`).emit(GatewayEvents.SOUNDBOARD_SOUND_PLAY, {
      guild_id: req.params.guildId,
      channel_id: channelId,
      user_id: req.user!.userId,
      sound,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
