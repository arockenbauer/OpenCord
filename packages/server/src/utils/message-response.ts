function safeParseJson(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function serializeMessageForClient<T extends Record<string, any>>(message: T | null, guildId?: string | null): T | null {
  if (!message) return null;

  const next: Record<string, any> = { ...message };

  if (Array.isArray(next.embeds)) {
    next.embeds = next.embeds.map((embed: any) => {
      if (embed && typeof embed.data === 'string') {
        return safeParseJson(embed.data, embed);
      }
      return embed;
    });
  }

  if (typeof next.components === 'string') {
    next.components = safeParseJson(next.components, null);
  }

  if (guildId !== undefined && next.guild_id === undefined) {
    next.guild_id = guildId;
  }

  return next as T;
}

export function serializeMessagesForClient<T extends Record<string, any>>(messages: T[], guildId?: string | null): T[] {
  return messages
    .map((message) => serializeMessageForClient(message, guildId))
    .filter((message): message is T => message != null);
}
