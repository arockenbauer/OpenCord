import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { checkPermission, getMemberPermissions, requireMembership } from './guild.controller.js';

const OFFICIAL_PLUGINS = [
  {
    slug: 'always-animate',
    name: 'Always Animate',
    description: 'Anime tout ce qui peut être animé.',
    version: '1.0.0',
    type: 'CLIENT',
    author: 'Équipe OpenCord',
    icon: '✨',
    settings_schema: JSON.stringify({
      type: 'object',
      properties: {
        speed: {
          type: 'number',
          title: "Vitesse d'animation",
          default: 1,
          minimum: 0.1,
          maximum: 3,
        },
      },
    }),
  },
  {
    slug: 'better-notes-box',
    name: 'Better Notes Box',
    description: 'Améliore la zone de notes et son comportement.',
    version: '1.0.0',
    type: 'CLIENT',
    author: 'Équipe OpenCord',
    icon: '📝',
    settings_schema: JSON.stringify({
      type: 'object',
      properties: {
        hideNotes: {
          type: 'boolean',
          title: 'Masquer les notes',
          default: false,
        },
        disableSpellCheck: {
          type: 'boolean',
          title: 'Désactiver le correcteur',
          default: false,
        },
      },
    }),
  },
  {
    slug: 'message-logger',
    name: 'Message Logger',
    description: 'Journalise les messages édités et supprimés.',
    version: '1.0.0',
    type: 'BOTH',
    author: 'Équipe OpenCord',
    icon: '📋',
    settings_schema: JSON.stringify({
      type: 'object',
      properties: {
        logChannelId: {
          type: 'string',
          title: 'Canal de journalisation',
          description: 'ID du canal où envoyer les logs',
        },
      },
    }),
  },
  {
    slug: 'better-role-dot',
    name: 'Better Role Dot',
    description: "Permet d'exploiter plus facilement les couleurs de rôles.",
    version: '1.0.0',
    type: 'CLIENT',
    author: 'Équipe OpenCord',
    icon: '🎨',
    settings_schema: null,
  },
  {
    slug: 'quick-react',
    name: 'Quick React',
    description: 'Ajoute des réactions rapides sur les messages.',
    version: '1.0.0',
    type: 'CLIENT',
    author: 'Équipe OpenCord',
    icon: '⚡',
    settings_schema: JSON.stringify({
      type: 'object',
      properties: {
        count: {
          type: 'number',
          title: "Nombre d'émojis",
          default: 5,
          minimum: 1,
          maximum: 8,
        },
      },
    }),
  },
] as const;

function parseStoredJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serializePlugin(plugin: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  type: 'CLIENT' | 'SERVER' | 'BOTH';
  author: string;
  icon: string | null;
  enabled_by_default: boolean;
  settings_schema: any | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: plugin.id,
    name: plugin.name,
    slug: plugin.slug,
    description: plugin.description,
    version: plugin.version,
    type: plugin.type,
    author: plugin.author,
    icon: plugin.icon,
    enabled_by_default: plugin.enabled_by_default,
    settings_schema: plugin.settings_schema,
    created_at: plugin.created_at,
    updated_at: plugin.updated_at,
  };
}

function validateSettings(schemaValue: string | null, settings: unknown): string[] {
  if (settings === null || settings === undefined) return [];

  const schema = parseStoredJson<Record<string, unknown>>(schemaValue);
  if (!schema) return [];

  if (schema.type !== 'object') return [];
  if (!isPlainObject(settings)) return ['Les paramètres doivent être un objet JSON.'];

  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  const errors: string[] = [];

  for (const [key, value] of Object.entries(settings)) {
    const definition = properties[key];
    if (!isPlainObject(definition)) {
      errors.push(`Paramètre inconnu : ${key}.`);
      continue;
    }

    switch (definition.type) {
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`${key} doit être un booléen.`);
        break;
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push(`${key} doit être un nombre.`);
        } else {
          if (typeof definition.minimum === 'number' && value < definition.minimum) {
            errors.push(`${key} doit être supérieur ou égal à ${definition.minimum}.`);
          }
          if (typeof definition.maximum === 'number' && value > definition.maximum) {
            errors.push(`${key} doit être inférieur ou égal à ${definition.maximum}.`);
          }
        }
        break;
      case 'string':
        if (typeof value !== 'string') errors.push(`${key} doit être une chaîne.`);
        break;
      case 'array':
        if (!Array.isArray(value)) errors.push(`${key} doit être un tableau.`);
        break;
      case 'object':
        if (!isPlainObject(value)) errors.push(`${key} doit être un objet.`);
        break;
      default:
        break;
    }
  }

  return errors;
}

async function ensureOfficialPlugins(): Promise<void> {
  await Promise.all(
    OFFICIAL_PLUGINS.map((plugin) => prisma.plugin.upsert({
      where: { slug: plugin.slug },
      create: {
        id: generateSnowflake(),
        enabled_by_default: false,
        type: plugin.type as any,
        settings_schema: plugin.settings_schema ? JSON.parse(plugin.settings_schema) : null,
        name: plugin.name,
        slug: plugin.slug,
        description: plugin.description,
        version: plugin.version,
        author: plugin.author,
        icon: plugin.icon,
      },
      update: {
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        type: plugin.type as any,
        author: plugin.author,
        icon: plugin.icon,
        settings_schema: plugin.settings_schema ? JSON.parse(plugin.settings_schema) : null,
      },
    }))
  );
}

function buildPreferenceResponse(
  plugin: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    version: string;
    type: 'CLIENT' | 'SERVER' | 'BOTH';
    author: string;
    icon: string | null;
    enabled_by_default: boolean;
    settings_schema: any | null;
    created_at: Date;
    updated_at: Date;
  },
  row?: { enabled: boolean; settings: any | null } | null,
) {
  return {
    plugin: serializePlugin(plugin),
    enabled: row?.enabled ?? plugin.enabled_by_default,
    settings: row?.settings ?? null,
  };
}

export async function getPlugins(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureOfficialPlugins();
    const plugins = await prisma.plugin.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    res.json(plugins.map((p) => serializePlugin(p as any)));
  } catch (err) {
    next(err);
  }
}

export async function getPlugin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureOfficialPlugins();
    const plugin = await prisma.plugin.findUnique({ where: { slug: req.params.slug } });
    if (!plugin) throw new AppError(404, 'PLUGIN_NOT_FOUND', 'Plugin not found');
    res.json(serializePlugin(plugin as any));
  } catch (err) {
    next(err);
  }
}

export async function getUserPlugins(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureOfficialPlugins();
    const userId = (req as any).user?.userId;
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const [plugins, settings] = await Promise.all([
      prisma.plugin.findMany({
        where: { type: { in: ['CLIENT', 'BOTH'] } },
        orderBy: { name: 'asc' },
      }),
      prisma.userPluginSettings.findMany({ where: { user_id: userId } }),
    ]);

    const settingsByPluginId = new Map(settings.map((row) => [row.plugin_id, row]));
    res.json(plugins.map((plugin) => buildPreferenceResponse(plugin as any, settingsByPluginId.get(plugin.id))));
  } catch (err) {
    next(err);
  }
}

export async function updateUserPlugin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureOfficialPlugins();
    const plugin = await prisma.plugin.findUnique({ where: { slug: req.params.slug } });
    if (!plugin || (plugin.type !== 'CLIENT' && plugin.type !== 'BOTH')) {
      throw new AppError(404, 'PLUGIN_NOT_FOUND', 'Plugin not found');
    }

    const validationErrors = req.body.settings !== undefined ? validateSettings(plugin.settings_schema, req.body.settings) : [];
    if (validationErrors.length > 0) {
      throw new AppError(400, 'INVALID_SETTINGS', validationErrors.join(' '));
    }

    const existing = await prisma.userPluginSettings.findUnique({
      where: { user_id_plugin_id: { user_id: req.user!.userId, plugin_id: plugin.id } },
    });

    const enabled = req.body.enabled !== undefined ? !!req.body.enabled : (existing?.enabled ?? plugin.enabled_by_default);
    const settings = req.body.settings !== undefined
      ? (req.body.settings === null ? null : req.body.settings)
      : (existing?.settings ?? null);

    const record = await prisma.userPluginSettings.upsert({
      where: { user_id_plugin_id: { user_id: req.user!.userId, plugin_id: plugin.id } },
      create: {
        user_id: req.user!.userId,
        plugin_id: plugin.id,
        enabled,
        settings,
      },
      update: {
        enabled,
        settings,
      },
    });

    res.json({
      plugin_slug: plugin.slug,
      enabled: record.enabled,
      settings: parseStoredJson(record.settings),
    });
  } catch (err) {
    next(err);
  }
}

export async function getGuildPlugins(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureOfficialPlugins();
    await requireMembership(req.params.guildId, req.user!.userId);
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const [plugins, settings] = await Promise.all([
      prisma.plugin.findMany({
        where: { type: { in: ['SERVER', 'BOTH'] } },
        orderBy: { name: 'asc' },
      }),
      prisma.guildPluginSettings.findMany({ where: { guild_id: req.params.guildId } }),
    ]);

    const settingsByPluginId = new Map(settings.map((row) => [row.plugin_id, row]));
    res.json(plugins.map((plugin) => buildPreferenceResponse(plugin as any, settingsByPluginId.get(plugin.id))));
  } catch (err) {
    next(err);
  }
}

export async function updateGuildPlugin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureOfficialPlugins();
    await requireMembership(req.params.guildId, req.user!.userId);
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const plugin = await prisma.plugin.findUnique({ where: { slug: req.params.slug } });
    if (!plugin || (plugin.type !== 'SERVER' && plugin.type !== 'BOTH')) {
      throw new AppError(404, 'PLUGIN_NOT_FOUND', 'Plugin not found');
    }

    const validationErrors = req.body.settings !== undefined ? validateSettings(plugin.settings_schema, req.body.settings) : [];
    if (validationErrors.length > 0) {
      throw new AppError(400, 'INVALID_SETTINGS', validationErrors.join(' '));
    }

    const existing = await prisma.guildPluginSettings.findUnique({
      where: { guild_id_plugin_id: { guild_id: req.params.guildId, plugin_id: plugin.id } },
    });

    const enabled = req.body.enabled !== undefined ? !!req.body.enabled : (existing?.enabled ?? plugin.enabled_by_default);
    const settings = req.body.settings !== undefined
      ? (req.body.settings === null ? null : req.body.settings)
      : (existing?.settings ?? null);

    const record = await prisma.guildPluginSettings.upsert({
      where: { guild_id_plugin_id: { guild_id: req.params.guildId, plugin_id: plugin.id } },
      create: {
        guild_id: req.params.guildId,
        plugin_id: plugin.id,
        enabled,
        settings,
      },
      update: {
        enabled,
        settings,
      },
    });

    res.json({
      plugin_slug: plugin.slug,
      enabled: record.enabled,
      settings: parseStoredJson(record.settings),
    });
  } catch (err) {
    next(err);
  }
}
