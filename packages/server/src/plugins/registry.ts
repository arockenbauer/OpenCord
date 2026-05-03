import type { ServerPlugin } from './types.js';

class PluginRegistry {
  private plugins: Map<string, ServerPlugin> = new Map();

  register(slug: string, plugin: ServerPlugin): void {
    this.plugins.set(slug, plugin);
  }

  get(slug: string): ServerPlugin | undefined {
    return this.plugins.get(slug);
  }

  getAll(): ServerPlugin[] {
    return Array.from(this.plugins.values());
  }

  unregister(slug: string): boolean {
    return this.plugins.delete(slug);
  }
}

export const registry = new PluginRegistry();
