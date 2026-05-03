import { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission, AUDIT_LOG_ACTIONS } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { EMOJI_LIMITS_BY_TIER, STICKER_LIMITS_BY_TIER } from '@opencord/shared';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

export async function getEmojis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const emojis = await prisma.emoji.findMany({
      where: { guild_id: req.params.guildId },
      include: { creator: { select: { id: true, username: true, avatar: true } } },
    });
    res.json(emojis);
  } catch (err) {
    next(err);
  }
}

export async function createEmoji(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x40000000));

    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

    // Validate emoji name
    const name = req.body.name;
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(name)) {
      throw new AppError(400, 'INVALID_EMOJI_NAME', 'Emoji name must be 2-32 characters, alphanumeric and underscores only');
    }

    // Check for duplicate name
    const existingEmoji = await prisma.emoji.findFirst({
      where: { guild_id: req.params.guildId, name },
    });
    if (existingEmoji) {
      throw new AppError(409, 'EMOJI_EXISTS', 'An emoji with this name already exists in this server');
    }

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId }, select: { premium_tier: true } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const tier = (guild.premium_tier ?? 0) as 0 | 1 | 2 | 3;
    const limits = EMOJI_LIMITS_BY_TIER[tier] ?? EMOJI_LIMITS_BY_TIER[0];
    const animated = req.file.mimetype === 'image/gif';
    const emojiType = animated ? 'animated' : 'static';

    const existingCount = await prisma.emoji.count({
      where: { guild_id: req.params.guildId, animated },
    });
    if (existingCount >= limits[emojiType]) {
      throw new AppError(403, 'EMOJI_LIMIT_REACHED', `Emoji limit reached for this tier (${limits[emojiType]} ${emojiType} emojis)`);
    }

    const emojiDir = path.join(uploadDir, 'emojis', req.params.guildId);
    fs.mkdirSync(emojiDir, { recursive: true });

    const emojiId = generateSnowflake();
    const ext = animated ? 'gif' : 'webp';
    const filename = `${emojiId}.${ext}`;

    if (animated) {
      fs.renameSync(req.file.path, path.join(emojiDir, filename));
    } else {
      await sharp(req.file.path).resize(128, 128, { fit: 'contain' }).webp().toFile(path.join(emojiDir, filename));
      fs.unlinkSync(req.file.path);
    }

    const emoji = await prisma.emoji.create({
      data: {
        id: emojiId,
        guild_id: req.params.guildId,
        name,
        creator_id: req.user!.userId,
        animated,
        asset: `/files/emojis/${req.params.guildId}/${filename}`,
        available: true,
      },
      include: { creator: { select: { id: true, username: true, avatar: true } } },
    });

    // Emit socket event
    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit('GUILD_EMOJIS_UPDATE', {
        guild_id: req.params.guildId,
        emojis: [emoji],
      });
    }

    res.status(201).json(emoji);
  } catch (err) {
    next(err);
  }
}

export async function getEmoji(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const emoji = await prisma.emoji.findFirst({
      where: { id: req.params.emojiId, guild_id: req.params.guildId },
      include: { creator: { select: { id: true, username: true, avatar: true } } },
    });
    if (!emoji) throw new AppError(404, 'NOT_FOUND', 'Emoji not found');
    res.json(emoji);
  } catch (err) {
    next(err);
  }
}

export async function updateEmoji(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x40000000));

    const emoji = await prisma.emoji.update({
      where: { id: req.params.emojiId },
      data: { name: req.body.name },
      include: { creator: { select: { id: true, username: true, avatar: true } } },
    });

    // Emit socket event
    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit('GUILD_EMOJIS_UPDATE', {
        guild_id: req.params.guildId,
        emojis: [emoji],
      });
    }

    res.json(emoji);
  } catch (err) {
    next(err);
  }
}

export async function deleteEmoji(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x40000000));

    const emoji = await prisma.emoji.findFirst({
      where: { id: req.params.emojiId, guild_id: req.params.guildId },
    });
    if (!emoji) throw new AppError(404, 'NOT_FOUND', 'Emoji not found');

    if (emoji.asset) {
      const filePath = path.join('.', emoji.asset);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.emoji.delete({ where: { id: req.params.emojiId } });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        user_id: req.user!.userId,
        action_type: AUDIT_LOG_ACTIONS.EMOJI_DELETE,
        target_id: req.params.emojiId,
        changes: JSON.stringify({ name: emoji.name, animated: emoji.animated }),
      },
    });

    // Emit socket event
    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit('GUILD_EMOJIS_UPDATE', {
        guild_id: req.params.guildId,
        emojis: [],
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getStickers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stickers = await prisma.sticker.findMany({
      where: { guild_id: req.params.guildId },
      include: { creator: { select: { id: true, username: true, avatar: true } } },
    });
    res.json(stickers);
  } catch (err) {
    next(err);
  }
}

export async function createSticker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x40000000));

    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

    // Validate sticker name
    const name = req.body.name;
    if (!name || name.length < 2 || name.length > 30) {
      throw new AppError(400, 'INVALID_STICKER_NAME', 'Sticker name must be 2-30 characters');
    }

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId }, select: { premium_tier: true } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const tier = (guild.premium_tier ?? 0) as 0 | 1 | 2 | 3;
    const limit = STICKER_LIMITS_BY_TIER[tier] ?? STICKER_LIMITS_BY_TIER[0];
    const existingCount = await prisma.sticker.count({ where: { guild_id: req.params.guildId } });
    if (existingCount >= limit) {
      throw new AppError(403, 'STICKER_LIMIT_REACHED', `Sticker limit reached for this tier (${limit} stickers)`);
    }

    // Determine format type
    let formatType = 1; // PNG default
    if (req.file.mimetype === 'image/gif') {
      formatType = 4; // GIF
    }

    const stickerDir = path.join(uploadDir, 'stickers', req.params.guildId);
    fs.mkdirSync(stickerDir, { recursive: true });

    const stickerId = generateSnowflake();
    const ext = formatType === 4 ? 'gif' : 'webp';
    const filename = `${stickerId}.${ext}`;

    if (formatType === 4) {
      fs.renameSync(req.file.path, path.join(stickerDir, filename));
    } else {
      await sharp(req.file.path).resize(320, 320, { fit: 'contain' }).webp().toFile(path.join(stickerDir, filename));
      fs.unlinkSync(req.file.path);
    }

    const sticker = await prisma.sticker.create({
      data: {
        id: stickerId,
        guild_id: req.params.guildId,
        name,
        description: req.body.description || null,
        tags: req.body.tags || null,
        format_type: formatType,
        creator_id: req.user!.userId,
        asset: `/uploads/stickers/${req.params.guildId}/${filename}`,
        available: true,
      },
      include: { creator: { select: { id: true, username: true, avatar: true } } },
    });

    // Emit socket event
    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit('GUILD_STICKERS_UPDATE', {
        guild_id: req.params.guildId,
        stickers: [sticker],
      });
    }

    res.status(201).json(sticker);
  } catch (err) {
    next(err);
  }
}

export async function deleteSticker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x40000000));

    const sticker = await prisma.sticker.findFirst({
      where: { id: req.params.stickerId, guild_id: req.params.guildId },
    });
    if (!sticker) throw new AppError(404, 'NOT_FOUND', 'Sticker not found');

    if (sticker.asset) {
      const filePath = path.join('.', sticker.asset);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.sticker.delete({ where: { id: req.params.stickerId } });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        user_id: req.user!.userId,
        action_type: AUDIT_LOG_ACTIONS.STICKER_DELETE,
        target_id: req.params.stickerId,
        changes: JSON.stringify({ name: sticker.name, format_type: sticker.format_type }),
      },
    });

    // Emit socket event
    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit('GUILD_STICKERS_UPDATE', {
        guild_id: req.params.guildId,
        stickers: [],
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getSticker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sticker = await prisma.sticker.findUnique({ where: { id: req.params.stickerId } });
    if (!sticker) throw new AppError(404, 'NOT_FOUND', 'Sticker not found');
    res.json(sticker);
  } catch (err) {
    next(err);
  }
}

export async function updateSticker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x40000000));

    const sticker = await prisma.sticker.findFirst({ where: { id: req.params.stickerId, guild_id: req.params.guildId } });
    if (!sticker) throw new AppError(404, 'NOT_FOUND', 'Sticker not found');

    const { name, description, tags } = req.body;
    
    // Validate name if provided
    if (name !== undefined && (name.length < 2 || name.length > 30)) {
      throw new AppError(400, 'INVALID_STICKER_NAME', 'Sticker name must be 2-30 characters');
    }

    const updated = await prisma.sticker.update({
      where: { id: req.params.stickerId },
      data: {
        name: name !== undefined ? name : sticker.name,
        description: description !== undefined ? description : sticker.description,
        tags: tags !== undefined ? tags : sticker.tags,
      },
      include: { creator: { select: { id: true, username: true, avatar: true } } },
    });

    // Emit socket event
    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit('GUILD_STICKERS_UPDATE', {
        guild_id: req.params.guildId,
        stickers: [updated],
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function getStickerPacks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stickers = await prisma.sticker.findMany({
      where: { available: true },
      orderBy: [{ guild_id: 'asc' }, { sort_value: 'asc' }],
    });

    const packs = stickers.reduce((acc: Record<string, { id: string; name: string; stickers: any[] }>, sticker) => {
      const packId = sticker.guild_id || 'default';
      if (!acc[packId]) {
        acc[packId] = { id: packId, name: sticker.guild_id ? 'Server Stickers' : 'Default Pack', stickers: [] };
      }
      acc[packId].stickers.push(sticker);
      return acc;
    }, {} as Record<string, any>);

    res.json({ sticker_packs: Object.values(packs) });
  } catch (err) {
    next(err);
  }
}
