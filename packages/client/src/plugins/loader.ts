import type { ClientPlugin } from './types.js';
import { registry } from './registry.js';

export async function loadPlugins(): Promise<void> {
  // Charger les plugins officiels depuis le dossier official/
  const plugins = import.meta.glob('../../plugins/official/*/index.ts', { eager: false });
  
  for (const [path, loader] of Object.entries(plugins)) {
    try {
      const module = await (loader as () => Promise<any>)();
      if (module.default) {
        const slug = (path as string).split('/')[3]; // plugins/official/<slug>/index.ts
        registry.register(slug!, module.default as ClientPlugin);
      }
    } catch (error) {
      console.error(`Failed to load client plugin:`, error);
    }
  }
}
