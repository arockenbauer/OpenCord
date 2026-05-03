import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../utils/prisma.js';
import { registry } from './registry.js';
import type { ServerPlugin, ServerPluginContext } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadPlugins(): Promise<void> {
  const plugins = await prisma.plugin.findMany({ where: { enabled_by_default: true } });
  
  for (const plugin of plugins) {
    try {
      const pluginPath = path.join(__dirname, '../../plugins/official', plugin.slug);
      const pluginModule = await import(pluginPath);
      
      if (pluginModule.default) {
        const serverPlugin = pluginModule.default as ServerPlugin;
        registry.register(plugin.slug, serverPlugin);
        
        // Initialiser le plugin avec le contexte
        const context: ServerPluginContext = {
          services: {
            messages: null, // TODO: injecter les vrais services
            channels: null,
            guilds: null,
            users: null,
          },
          getGuildSettings: async (guildId: string) => {
            const settings = await prisma.guildPluginSettings.findUnique({
              where: { guild_id_plugin_id: { guild_id: guildId, plugin_id: plugin.id } },
            });
            return settings?.settings as any ?? null;
          },
          emit: (event: string, room: string, data: unknown) => {
            // TODO: injecter io pour émettre via Socket.IO
            console.log(`Plugin ${plugin.slug} emit:`, event, room, data);
          },
        };
        
        await serverPlugin.onEnable(context);
      }
    } catch (error) {
      console.error(`Failed to load plugin ${plugin.slug}:`, error);
    }
  }
}

// Fonctions utilitaires pour appeler les hooks
export async function runMessageBeforeCreateHooks(message: any): Promise<any | null> {
  const plugins = registry.getAll();
  for (const plugin of plugins) {
    if (plugin.hooks['message.beforeCreate']) {
      const result = await plugin.hooks['message.beforeCreate'](message);
      if (result === null) return null; // Bloquer le message
      message = result;
    }
  }
  return message;
}

export async function runMessageAfterCreateHooks(message: any): Promise<void> {
  const plugins = registry.getAll();
  for (const plugin of plugins) {
    if (plugin.hooks['message.afterCreate']) {
      await plugin.hooks['message.afterCreate'](message);
    }
  }
}

export async function runMessageBeforeDeleteHooks(messageId: string): Promise<boolean> {
  const plugins = registry.getAll();
  for (const plugin of plugins) {
    if (plugin.hooks['message.beforeDelete']) {
      const result = await plugin.hooks['message.beforeDelete'](messageId);
      if (result === false) return false; // Bloquer la suppression
    }
  }
  return true;
}
