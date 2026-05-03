import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';

// --- Application Role Connection Metadata (Bot Token Required) ---

// GET /api/applications/:appId/role-connections/metadata
export async function getRoleConnectionMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;
    const metadata = await prisma.applicationRoleConnectionMetadata.findMany({
      where: { application_id: appId },
    });
    res.json(metadata.map(m => ({
      application_id: m.application_id,
      key: m.key,
      name: m.name,
      name_localizations: m.name_localizations,
      description: m.description,
      description_localizations: m.description_localizations,
      type: m.type,
    })));
  } catch (err) {
    next(err);
  }
}

// PUT /api/applications/:appId/role-connections/metadata
export async function setRoleConnectionMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;
    const records = req.body;

    if (!Array.isArray(records) || records.length > 5) {
      throw new AppError(400, 'INVALID_INPUT', 'Expected an array of up to 5 metadata records');
    }

    // Validate each record
    for (const r of records) {
      if (!r.key || r.key.length > 50) throw new AppError(400, 'INVALID_KEY', 'Key max 50 chars');
      if (!r.name || r.name.length > 100) throw new AppError(400, 'INVALID_NAME', 'Name max 100 chars');
      if (r.description && r.description.length > 200) throw new AppError(400, 'INVALID_DESCRIPTION', 'Description max 200 chars');
      if (![1,2,3,4,5,6,7,8].includes(r.type)) throw new AppError(400, 'INVALID_TYPE', 'Type must be 1-8');
    }

    // Delete existing and create new (replace semantics)
    await prisma.$transaction([
      prisma.applicationRoleConnectionMetadata.deleteMany({ where: { application_id: appId } }),
      prisma.applicationRoleConnectionMetadata.createMany({
        data: records.map(r => ({
          application_id: appId,
          key: r.key,
          name: r.name,
          name_localizations: r.name_localizations || undefined,
          description: r.description,
          description_localizations: r.description_localizations || undefined,
          type: r.type,
        })),
      }),
    ]);

    const updated = await prisma.applicationRoleConnectionMetadata.findMany({
      where: { application_id: appId },
    });

    res.json(updated.map(m => ({
      application_id: m.application_id,
      key: m.key,
      name: m.name,
      name_localizations: m.name_localizations,
      description: m.description,
      description_localizations: m.description_localizations,
      type: m.type,
    })));
  } catch (err) {
    next(err);
  }
}

// --- User Application Role Connection (OAuth2 scope role_connections.write) ---

// GET /api/users/@me/applications/:appId/role-connection
export async function getUserRoleConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { appId } = req.params;

    const connection = await prisma.userApplicationRoleConnection.findUnique({
      where: { user_id_application_id: { user_id: userId, application_id: appId } },
    });

    if (!connection) {
      res.json({ platform_name: null, platform_username: null, metadata: {} });
      return;
    }

    res.json({
      platform_name: connection.platform_name,
      platform_username: connection.platform_username,
      metadata: connection.metadata,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/@me/applications/:appId/role-connection
export async function updateUserRoleConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { appId } = req.params;
    const { platform_name, platform_username, metadata } = req.body;

    if (metadata && typeof metadata !== 'object') {
      throw new AppError(400, 'INVALID_METADATA', 'metadata must be an object');
    }

    const connection = await prisma.userApplicationRoleConnection.upsert({
      where: { user_id_application_id: { user_id: userId, application_id: appId } },
      create: {
        user_id: userId,
        application_id: appId,
        platform_name: platform_name || null,
        platform_username: platform_username || null,
        metadata: metadata || {},
      },
      update: {
        ...(platform_name !== undefined && { platform_name }),
        ...(platform_username !== undefined && { platform_username }),
        ...(metadata !== undefined && { metadata }),
      },
    });

    // Emit gateway event
    const io = (req as any).app?.get?.('io');
    if (io) {
      // Get user's guilds to emit event
      const members = await prisma.guildMember.findMany({
        where: { user_id: userId },
        select: { guild_id: true },
      });
      for (const m of members) {
        io.to(`guild:${m.guild_id}`).emit('ROLE_CONNECTION_UPDATE', {
          user_id: userId,
          application_id: appId,
          metadata: connection.metadata,
        });
      }
    }

    res.json({
      platform_name: connection.platform_name,
      platform_username: connection.platform_username,
      metadata: connection.metadata,
    });
  } catch (err) {
    next(err);
  }
}

// --- Guild Role Connection Requirements (Guild Admin) ---

// GET /api/guilds/:guildId/roles/:roleId/role-connection-requirements
export async function getRoleConnectionRequirements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guildId, roleId } = req.params;
    const requirements = await prisma.guildRoleConnectionRequirement.findMany({
      where: { guild_id: guildId, role_id: roleId },
    });
    res.json(requirements.map(r => ({
      guild_id: r.guild_id,
      role_id: r.role_id,
      application_id: r.application_id,
      metadata_key: r.metadata_key,
      metadata_value: r.metadata_value,
    })));
  } catch (err) {
    next(err);
  }
}

// PUT /api/guilds/:guildId/roles/:roleId/role-connection-requirements
export async function setRoleConnectionRequirements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guildId, roleId } = req.params;
    const requirements = req.body;

    if (!Array.isArray(requirements)) {
      throw new AppError(400, 'INVALID_INPUT', 'Expected an array of requirements');
    }

    // Validate requirements
    for (const r of requirements) {
      if (!r.application_id || !r.metadata_key || !r.metadata_value) {
        throw new AppError(400, 'INVALID_REQUIREMENT', 'Missing required fields');
      }
    }

    // Replace all requirements for this role
    await prisma.$transaction([
      prisma.guildRoleConnectionRequirement.deleteMany({
        where: { guild_id: guildId, role_id: roleId },
      }),
      prisma.guildRoleConnectionRequirement.createMany({
        data: requirements.map(r => ({
          guild_id: guildId,
          role_id: roleId,
          application_id: r.application_id,
          metadata_key: r.metadata_key,
          metadata_value: r.metadata_value,
        })),
      }),
    ]);

    const updated = await prisma.guildRoleConnectionRequirement.findMany({
      where: { guild_id: guildId, role_id: roleId },
    });

    res.json(updated.map(r => ({
      guild_id: r.guild_id,
      role_id: r.role_id,
      application_id: r.application_id,
      metadata_key: r.metadata_key,
      metadata_value: r.metadata_value,
    })));
  } catch (err) {
    next(err);
  }
}
