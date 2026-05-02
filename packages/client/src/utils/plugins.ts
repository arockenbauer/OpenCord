export interface PluginDescriptor {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  version: string;
  type: string;
  author: string;
  icon?: string | null;
  enabled_by_default?: boolean;
  settings_schema?: unknown;
}

export interface PluginPreference {
  plugin: PluginDescriptor;
  enabled: boolean;
  settings: Record<string, unknown> | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePluginSchema(schema: unknown): Record<string, unknown> | null {
  if (!schema) return null;
  if (typeof schema === 'string') {
    try {
      return JSON.parse(schema) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return isPlainObject(schema) ? schema : null;
}

export function buildDefaultPluginSettings(schema: unknown): Record<string, unknown> {
  const parsed = parsePluginSchema(schema);
  const properties = parsed && isPlainObject(parsed.properties) ? parsed.properties : {};
  const defaults: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (isPlainObject(value) && value.default !== undefined) {
      defaults[key] = value.default;
    }
  }

  return defaults;
}

export function applyClientPluginPreferences(preferences: PluginPreference[]): void {
  const root = document.documentElement;
  const alwaysAnimate = preferences.find((entry) => entry.enabled && entry.plugin.slug === 'always-animate');

  if (alwaysAnimate) {
    root.dataset.pluginAlwaysAnimate = 'true';
    const speed = Number(alwaysAnimate.settings?.speed);
    root.style.setProperty('--plugin-always-animate-speed', Number.isFinite(speed) && speed > 0 ? String(speed) : '1');
  } else {
    delete root.dataset.pluginAlwaysAnimate;
    root.style.removeProperty('--plugin-always-animate-speed');
  }
}
