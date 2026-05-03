import type { ServerPlugin, ServerPluginContext } from '../../plugins/types.js';

const plugin: ServerPlugin = {
  meta: {
    name: 'Message Logger',
    slug: 'message-logger',
    description: 'Journalise les messages édités et supprimés.',
    version: '1.0.0',
    type: 'SERVER',
    author: 'Équipe OpenCord',
    icon: '📋',
    settingsSchema: {
      type: 'object',
      properties: {
        logChannelId: {
          type: 'string',
          title: 'Canal de journalisation',
          description: 'ID du canal où envoyer les logs',
        },
      },
    },
  },
  
  onEnable(context: ServerPluginContext): void {
    console.log('Message Logger plugin enabled');
  },
  
  onDisable(): void {
    console.log('Message Logger plugin disabled');
  },
  
  hooks: {
    async 'message.afterCreate'(message: any) {
      const settings = await context.getGuildSettings<{ logChannelId?: string }>(message.guild_id);
      if (settings?.logChannelId) {
        // TODO: envoyer un message dans le canal de log
        console.log(`[Message Logger] Message créé: ${message.id}`);
      }
    },
    
    async 'message.beforeDelete'(messageId: string) {
      // Laisser passer la suppression
      return true;
    },
  },
};

export default plugin;
