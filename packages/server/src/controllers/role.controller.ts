import { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission, getHighestRolePosition, requireMembership, writeAuditLog } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

export async function getRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);
    const roles = await prisma.role.findMany({
      where: { guild_id: req.params.guildId },
      orderBy: { position: 'asc' },
    });
    res.json(roles);
  } catch (err) {
    next(err);
  }
}

export async function createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x10000000));

    const maxPos = await prisma.role.aggregate({ where: { guild_id: req.params.guildId }, _max: { position: true } });

    const role = await prisma.role.create({
      data: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        name: req.body.name || 'new role',
        color: req.body.color || null,
        hoist: req.body.hoist || false,
        position: (maxPos._max.position || 0) + 1,
        permissions: String(req.body.permissions || '0'),
        mentionable: req.body.mentionable || false,
      },
    });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_ROLE_CREATE, { guild_id: req.params.guildId, role });
    await writeAuditLog(req.params.guildId, req.user!.userId, 'ROLE_CREATE', role.id, 'ROLE', { name: role.name });

    res.status(201).json(role);
  } catch (err) {
    next(err);
  }
}

export async function updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x10000000));
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);
    const targetRole = await prisma.role.findFirst({ where: { id: req.params.roleId, guild_id: req.params.guildId } });
    if (!targetRole) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
    if (targetRole.name === '@everyone') throw new AppError(400, 'CANNOT_EDIT', 'Cannot edit @everyone role');
    if (actorHighestRole <= targetRole.position) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot edit a role equal or higher than your top role');
    }

    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.color !== undefined) data.color = req.body.color;
    if (req.body.hoist !== undefined) data.hoist = req.body.hoist;
    if (req.body.mentionable !== undefined) data.mentionable = req.body.mentionable;
    if (req.body.permissions !== undefined) data.permissions = String(req.body.permissions);
    if (req.body.position !== undefined) data.position = req.body.position;
    if (req.body.unicode_emoji !== undefined) data.unicode_emoji = req.body.unicode_emoji;

    const role = await prisma.role.update({ where: { id: req.params.roleId }, data });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_ROLE_UPDATE, { guild_id: req.params.guildId, role });
    await writeAuditLog(req.params.guildId, req.user!.userId, 'ROLE_UPDATE', role.id, 'ROLE', { before: { name: targetRole.name, color: targetRole.color, permissions: targetRole.permissions }, after: data });

    res.json(role);
  } catch (err) {
    next(err);
  }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x10000000));
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);

    const role = await prisma.role.findUnique({ where: { id: req.params.roleId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
    if (role.name === '@everyone') throw new AppError(400, 'CANNOT_DELETE', 'Cannot delete @everyone role');
    if (actorHighestRole <= role.position) throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot delete a role equal or higher than your top role');

    await prisma.role.delete({ where: { id: req.params.roleId } });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_ROLE_DELETE, { guild_id: req.params.guildId, role_id: req.params.roleId });
    await writeAuditLog(req.params.guildId, req.user!.userId, 'ROLE_DELETE', req.params.roleId, 'ROLE', { name: role.name });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function updateRolePositions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x10000000));
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);

    const positions: { id: string; position: number }[] = req.body;
    for (const p of positions) {
      const role = await prisma.role.findFirst({ where: { id: p.id, guild_id: req.params.guildId } });
      if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
      if (role.name === '@everyone') throw new AppError(400, 'CANNOT_EDIT', 'Cannot move @everyone role');
      if (actorHighestRole <= role.position || actorHighestRole <= p.position) {
        throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot move a role equal or higher than your top role');
      }
      await prisma.role.update({ where: { id: p.id }, data: { position: p.position } });
    }

    const roles = await prisma.role.findMany({ where: { guild_id: req.params.guildId }, orderBy: { position: 'asc' } });
    await writeAuditLog(req.params.guildId, req.user!.userId, 'ROLE_POSITIONS_UPDATE', undefined, 'ROLE', {
      positions,
    });
    res.json({ roles });
  } catch (err) {
    next(err);
  }
}

export async function updateRoleIcon(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x10000000));

    const role = await prisma.role.findFirst({ where: { id: req.params.roleId, guild_id: req.params.guildId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');

    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

    const iconDir = path.join(uploadDir, 'role-icons', req.params.guildId);
    fs.mkdirSync(iconDir, { recursive: true });

    const filename = `${req.params.roleId}.webp`;
    await sharp(req.file.path).resize(128, 128, { fit: 'contain' }).webp().toFile(path.join(iconDir, filename));
    fs.unlinkSync(req.file.path);

    const updated = await prisma.role.update({
      where: { id: req.params.roleId },
      data: { icon: `/uploads/role-icons/${req.params.guildId}/${filename}`, unicode_emoji: null },
    });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_ROLE_UPDATE, { guild_id: req.params.guildId, role: updated });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function getRoleConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);
    const role = await prisma.role.findFirst({ where: { id: req.params.roleId, guild_id: req.params.guildId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
    res.json({ metadata: [] });
  } catch (err) {
    next(err);
  }
}

export async function updateRoleConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x10000000));

    const role = await prisma.role.findFirst({ where: { id: req.params.roleId, guild_id: req.params.guildId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');

    res.json({ metadata: req.body.metadata || [] });
  } catch (err) {
    next(err);
  }
}

export async function getRoleHierarchy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);
    const roles = await prisma.role.findMany({
      where: { guild_id: req.params.guildId },
      orderBy: { position: 'desc' },
      select: { id: true, name: true, position: true, color: true, managed: true },
    });
    res.json({ roles });
  } catch (err) {
    next(err);
  }
}
