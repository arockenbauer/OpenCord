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

export interface ClientPluginHooks {
  'message.render': (params: { message: any; element: HTMLElement }) => void;
  'channel.header': (params: { channel: any }) => void;
  'user.profile': (params: { user: any; member?: any }) => void;
  'user.popout': (params: { user: any }) => void;
  'settings.page': (params: { registerPage: (id: string, label: string, component: any) => void }) => void;
  'context.menu': (params: { type: string; target: any; addItem: (item: any) => void }) => void;
  'toolbar': (params: { channel: any; addButton: (button: any) => void }) => void;
  'message.input': (params: { channel: any; addElement: (element: HTMLElement) => void }) => void;
}

export interface PluginContext {
  currentUser: Readonly<any>;
  getSettings<T>(): T;
  saveSettings<T>(settings: T): Promise<void>;
  t(key: string, options?: Record<string, unknown>): string;
}

export interface ClientPlugin {
  meta: PluginMeta;
  onEnable(context: PluginContext): void | Promise<void>;
  onDisable(): void | Promise<void>;
  hooks: Partial<ClientPluginHooks>;
}
