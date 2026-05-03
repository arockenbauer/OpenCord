import type { ClientPlugin } from './types.js';

class PluginRegistry {
  private plugins: Map<string, ClientPlugin> = new Map();

  register(slug: string, plugin: ClientPlugin): void {
    this.plugins.set(slug, plugin);
  }

  get(slug: string): ClientPlugin | undefined {
    return this.plugins.get(slug);
  }

  getAll(): ClientPlugin[] {
    return Array.from(this.plugins.values());
  }

  unregister(slug: string): boolean {
    return this.plugins.delete(slug);
  }
}

export const registry = new PluginRegistry();
