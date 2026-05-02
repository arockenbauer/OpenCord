import { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission } from './guild.controller.js';
import { EMOJI_LIMITS_BY_TIER, STICKER_LIMITS_BY_TIER } from '@opencord/shared';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

export async function getEmojis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const emojis = await prisma.emoji.findMany({ where: { guild_id: req.params.guildId } });
    res.json({ emojis });
  } catch (err) {
    next(err);
  }
}

export async function createEmoji(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x40000000));

    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

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
        name: req.body.name,
        creator_id: req.user!.userId,
        animated,
        asset: `/uploads/emojis/${req.params.guildId}/${filename}`,
        available: true,
      },
    });

    res.status(201).json(emoji);
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
    });
    res.json(emoji);
  } catch (err) {
    next(err);
  }
}

export async function deleteEmoji(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x40000000));

    const emoji = await prisma.emoji.findUnique({ where: { id: req.params.emojiId } });
    if (emoji?.asset) {
      const filePath = path.join('.', emoji.asset);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.emoji.delete({ where: { id: req.params.emojiId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getStickers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stickers = await prisma.sticker.findMany({ where: { guild_id: req.params.guildId } });
    res.json({ stickers });
  } catch (err) {
    next(err);
  }
}

export async function createSticker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x40000000));

    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId }, select: { premium_tier: true } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const tier = (guild.premium_tier ?? 0) as 0 | 1 | 2 | 3;
    const limit = STICKER_LIMITS_BY_TIER[tier] ?? STICKER_LIMITS_BY_TIER[0];
    const existingCount = await prisma.sticker.count({ where: { guild_id: req.params.guildId } });
    if (existingCount >= limit) {
      throw new AppError(403, 'STICKER_LIMIT_REACHED', `Sticker limit reached for this tier (${limit} stickers)`);
    }

    const stickerDir = path.join(uploadDir, 'stickers', req.params.guildId);
    fs.mkdirSync(stickerDir, { recursive: true });

    const stickerId = generateSnowflake();
    const filename = `${stickerId}.webp`;

    await sharp(req.file.path).resize(320, 320, { fit: 'contain' }).webp().toFile(path.join(stickerDir, filename));
    fs.unlinkSync(req.file.path);

    const sticker = await prisma.sticker.create({
      data: {
        id: stickerId,
        guild_id: req.params.guildId,
        name: req.body.name,
        description: req.body.description || null,
        tags: req.body.tags || null,
        creator_id: req.user!.userId,
        asset: `/uploads/stickers/${req.params.guildId}/${filename}`,
        available: true,
      },
    });

    res.status(201).json(sticker);
  } catch (err) {
    next(err);
  }
}

export async function deleteSticker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x40000000));

    const sticker = await prisma.sticker.findUnique({ where: { id: req.params.stickerId } });
    if (sticker?.asset) {
      const filePath = path.join('.', sticker.asset);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.sticker.delete({ where: { id: req.params.stickerId } });
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
    const updated = await prisma.sticker.update({
      where: { id: req.params.stickerId },
      data: {
        name: name !== undefined ? name : sticker.name,
        description: description !== undefined ? description : sticker.description,
        tags: tags !== undefined ? tags : sticker.tags,
      },
    });

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
