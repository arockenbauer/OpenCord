export interface PluginMeta {
  name: string;
  slug: string;
  description: string;
  version: string;
  type: 'CLIENT' | 'SERVER' | 'BOTH';
  author: string;
  icon?: string;
  settingsSchema?: Record<string, unknown>;
}

export interface ServerPluginHooks {
  'message.beforeCreate': (message: any) => Promise<any | null>;
  'message.afterCreate': (message: any) => Promise<void>;
  'message.beforeDelete': (messageId: string) => Promise<boolean>;
  'member.join': (member: any) => Promise<void>;
  'member.leave': (member: any) => Promise<void>;
  'guild.update': (guild: any) => Promise<void>;
  'channel.create': (channel: any) => Promise<void>;
  'channel.update': (channel: any) => Promise<void>;
  'channel.delete': (channel: any) => Promise<void>;
  'role.create': (role: any) => Promise<void>;
  'role.update': (role: any) => Promise<void>;
  'role.delete': (role: any) => Promise<void>;
}

export interface ServerPlugin {
  meta: PluginMeta;
  onEnable(context: ServerPluginContext): void | Promise<void>;
  onDisable(): void | Promise<void>;
  hooks: Partial<ServerPluginHooks>;
}

export interface ServerPluginContext {
  services: {
    messages: any;
    channels: any;
    guilds: any;
    users: any;
  };
  getGuildSettings<T>(guildId: string): Promise<T>;
  emit(event: string, room: string, data: unknown): void;
}
