import { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission, getHighestRolePosition, requireMembership, writeAuditLog, AUDIT_LOG_ACTIONS } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents, PERMISSION_BITS } from '@opencord/shared';
import { serializeBigInt } from '../utils/serialize.js';
import { markTemplateDirty } from './guild.controller.js';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

export async function getRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);
    const roles = await prisma.role.findMany({
      where: { guild_id: req.params.guildId },
      orderBy: { position: 'asc' },
    });
    res.json(serializeBigInt(roles));
  } catch (err) {
    next(err);
  }
}

export async function createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, PERMISSION_BITS.MANAGE_ROLES);

    const maxPos = await prisma.role.aggregate({ where: { guild_id: req.params.guildId }, _max: { position: true } });

    const role = await prisma.role.create({
      data: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        name: req.body.name || 'new role',
        color: req.body.color || null,
        hoist: req.body.hoist || false,
        position: (maxPos._max.position || 0) + 1,
        permissions: BigInt(req.body.permissions || '0'),
        mentionable: req.body.mentionable || false,
      },
    });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_ROLE_CREATE, serializeBigInt({ guild_id: req.params.guildId, role }));
    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.ROLE_CREATE, role.id, 'ROLE', [
      { key: 'name', old_value: null, new_value: role.name },
      { key: 'color', old_value: null, new_value: role.color },
      { key: 'permissions', old_value: null, new_value: role.permissions.toString() },
      { key: 'hoist', old_value: null, new_value: role.hoist },
      { key: 'mentionable', old_value: null, new_value: role.mentionable },
    ]);
    await markTemplateDirty(req.params.guildId);

    res.status(201).json(serializeBigInt(role));
  } catch (err) {
    next(err);
  }
}

export async function updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, PERMISSION_BITS.MANAGE_ROLES);
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);
    const targetRole = await prisma.role.findFirst({ where: { id: req.params.roleId, guild_id: req.params.guildId } });
    if (!targetRole) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
    if (targetRole.name === '@everyone') {
      const invalidEveryoneFields = ['name', 'color', 'hoist', 'position', 'unicode_emoji'].filter((field) => req.body[field] !== undefined);
      if (invalidEveryoneFields.length > 0) {
        throw new AppError(400, 'CANNOT_EDIT_EVERYONE', 'Only permissions and mentionable can be edited on @everyone');
      }
    } else if (actorHighestRole <= targetRole.position) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot edit a role equal or higher than your top role');
    }

    const data: any = {};
    if (targetRole.name !== '@everyone' && req.body.name !== undefined) data.name = req.body.name;
    if (targetRole.name !== '@everyone' && req.body.color !== undefined) data.color = req.body.color;
    if (targetRole.name !== '@everyone' && req.body.hoist !== undefined) data.hoist = req.body.hoist;
    if (req.body.mentionable !== undefined) data.mentionable = req.body.mentionable;
    if (req.body.permissions !== undefined) data.permissions = BigInt(req.body.permissions);
    if (targetRole.name !== '@everyone' && req.body.position !== undefined) data.position = req.body.position;
    if (targetRole.name !== '@everyone' && req.body.unicode_emoji !== undefined) data.unicode_emoji = req.body.unicode_emoji;

    const role = await prisma.role.update({ where: { id: req.params.roleId }, data });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_ROLE_UPDATE, serializeBigInt({ guild_id: req.params.guildId, role }));
    const changes = [];
    if (req.body.name !== undefined) changes.push({ key: 'name', old_value: targetRole.name, new_value: req.body.name });
    if (req.body.color !== undefined) changes.push({ key: 'color', old_value: targetRole.color, new_value: req.body.color });
    if (req.body.permissions !== undefined) changes.push({ key: 'permissions', old_value: targetRole.permissions.toString(), new_value: req.body.permissions });
    if (req.body.hoist !== undefined) changes.push({ key: 'hoist', old_value: targetRole.hoist, new_value: req.body.hoist });
    if (req.body.mentionable !== undefined) changes.push({ key: 'mentionable', old_value: targetRole.mentionable, new_value: req.body.mentionable });
    if (req.body.position !== undefined) changes.push({ key: 'position', old_value: targetRole.position, new_value: req.body.position });
    if (req.body.unicode_emoji !== undefined) changes.push({ key: 'unicode_emoji', old_value: targetRole.unicode_emoji, new_value: req.body.unicode_emoji });
    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.ROLE_UPDATE, role.id, 'ROLE', changes);
    await markTemplateDirty(req.params.guildId);

    res.json(serializeBigInt(role));
  } catch (err) {
    next(err);
  }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, PERMISSION_BITS.MANAGE_ROLES);
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);

    const role = await prisma.role.findUnique({ where: { id: req.params.roleId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
    if (role.name === '@everyone') throw new AppError(400, 'CANNOT_DELETE', 'Cannot delete @everyone role');
    if (actorHighestRole <= role.position) throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot delete a role equal or higher than your top role');

    await prisma.role.delete({ where: { id: req.params.roleId } });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_ROLE_DELETE, { guild_id: req.params.guildId, role_id: req.params.roleId });
    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.ROLE_DELETE, req.params.roleId, 'ROLE', [
      { key: 'name', old_value: role.name, new_value: null },
    ]);
    await markTemplateDirty(req.params.guildId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function updateRolePositions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, PERMISSION_BITS.MANAGE_ROLES);
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);

    const positions: { id: string; position: number }[] = req.body;
    
    // Vérifier que @everyone n'est pas dans la liste et reste en position 0
    const everyoneRole = await prisma.role.findFirst({ 
      where: { guild_id: req.params.guildId, name: '@everyone' } 
    });
    if (!everyoneRole) throw new AppError(404, 'EVERYONE_ROLE_NOT_FOUND', '@everyone role not found');
    
    for (const p of positions) {
      const role = await prisma.role.findFirst({ where: { id: p.id, guild_id: req.params.guildId } });
      if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
      if (role.name === '@everyone') {
        throw new AppError(400, 'CANNOT_EDIT', 'Cannot move @everyone role');
      }
      // Vérifier que le rôle cible est inférieur à notre rôle le plus haut
      if (actorHighestRole <= role.position) {
        throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot move a role equal or higher than your top role');
      }
      // Vérifier que la nouvelle position demandée est inférieure à notre rôle le plus haut
      if (actorHighestRole <= p.position) {
        throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot move a role to a position equal or higher than your top role');
      }
      await prisma.role.update({ where: { id: p.id }, data: { position: p.position } });
    }

    // Récupérer tous les rôles triés par position
    const roles = await prisma.role.findMany({ 
      where: { guild_id: req.params.guildId }, 
      orderBy: { position: 'asc' } 
    });
    
    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.ROLE_CREATE, undefined, 'ROLE', [
      { key: 'positions', old_value: null, new_value: JSON.stringify(positions) },
    ]);
    res.json(serializeBigInt({ roles }));
  } catch (err) {
    next(err);
  }
}

export async function updateRoleIcon(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, PERMISSION_BITS.MANAGE_ROLES);

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
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_ROLE_UPDATE, serializeBigInt({ guild_id: req.params.guildId, role: updated }));

    res.json(serializeBigInt(updated));
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
    checkPermission(perms, PERMISSION_BITS.MANAGE_ROLES);

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
