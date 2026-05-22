import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || '';
const API_PREFIX = '/api';
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

export function setTokens(): void {
  // Tokens are now in httpOnly cookies, nothing to store in JS
}

export function clearTokens(): void {
  // Tokens are cleared via logout endpoint which clears cookies
}

export async function authorizeOAuth(data: { application_id: string; guild_id: string; permissions: string }): Promise<void> {
  await fetchWithAuth('/oauth2/authorize', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getAccessToken(): string | null {
  // Token is in httpOnly cookie, not accessible via JavaScript
  // Return null - the cookie is sent automatically with fetch requests
  return null;
}

type QueryValue = string | number | boolean | null | undefined;

function normalizeUrl(url: string): string {
  if (ABSOLUTE_URL_PATTERN.test(url)) return url;
  if (url.startsWith(API_PREFIX)) return url;
  return `${API_PREFIX}${url.startsWith('/') ? url : `/${url}`}`;
}

function resolveUrl(url: string): string {
  if (ABSOLUTE_URL_PATTERN.test(url)) return url;
  return `${API_URL}${normalizeUrl(url)}`;
}

function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return '';
  const entries = Object.entries(params).reduce<Array<[string, string]>>((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc.push([key, String(value)]);
    }
    return acc;
  }, []);
  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : '';
}

function buildPagedQuery(params?: { page?: number; limit?: number; offset?: number } & Record<string, QueryValue>): string {
  if (!params) return '';
  const next: Record<string, QueryValue> = { ...params };
  const limit = typeof params.limit === 'number' ? params.limit : Number(params.limit);
  const offset = typeof params.offset === 'number' ? params.offset : Number(params.offset);

  if (next.page === undefined && Number.isFinite(offset) && Number.isFinite(limit) && limit > 0) {
    next.page = Math.floor(offset / limit) + 1;
  }

  delete next.offset;
  return buildQuery(next);
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) throw Object.assign(new Error(`Request failed with status ${res.status}`), { status: res.status });
    return undefined as T;
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    if (!res.ok) throw Object.assign(new Error(`Request failed with status ${res.status}`), { status: res.status });
    return undefined as T;
  }
  if (!res.ok) {
    const errData = data.error || data;
    const error = new Error(errData.message || 'Request failed') as any;
    error.code = errData.code;
    error.status = res.status;
    error.details = errData.details;
    error.retry_after = errData.retry_after;
    throw error;
  }
  return data as T;
}

let _refreshing: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (_refreshing) return _refreshing;
  _refreshing = fetch(resolveUrl('/auth/refresh'), { method: 'POST', credentials: 'include' })
    .then(r => r.ok)
    .catch(() => false)
    .finally(() => { _refreshing = null; });
  return _refreshing;
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(resolveUrl(url), { ...options, credentials: 'include' });

  const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh');
  const isUserMe = url.includes('/users/@me');

  if (res.status === 401 && !isAuthEndpoint && !isUserMe) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return fetch(resolveUrl(url), { ...options, credentials: 'include' });
    }
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    useAuthStore.getState().setUser(null as any);
    useAuthStore.getState().setRelationships([]);
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  return res;
}

// ── Core typed function (callable as `api<T>(url, options?)` ─────────────────
async function apiFn<T>(url: string, options?: RequestInit): Promise<T> {
  if (options?.body && typeof options.body === 'string') {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    options = { ...options, headers };
  }
  return fetchWithAuth(url, options).then(r => handleResponse<T>(r));
}

type ApiFn = typeof apiFn;

function typedGet<T>(url: string, options?: RequestInit) { return apiFn<T>(url, { ...options, method: 'GET' }); }
function typedPost<T>(url: string, data?: unknown, options?: RequestInit) {
  return apiFn<T>(url, { ...options, method: 'POST', body: data instanceof FormData ? data : JSON.stringify(data) });
}

export const api = Object.assign(apiFn, {
  get: typedGet,
  post: typedPost,
  put: <T>(url: string, data?: unknown, options?: RequestInit) =>
    apiFn<T>(url, { ...options, method: 'PUT', body: JSON.stringify(data) }),
  patch: <T>(url: string, data?: unknown, options?: RequestInit) =>
    apiFn<T>(url, { ...options, method: 'PATCH', body: data instanceof FormData ? data : JSON.stringify(data) }),
  delete: <T>(url: string, options?: RequestInit) => apiFn<T>(url, { ...options, method: 'DELETE' }),
  postFormData: <T>(url: string, formData: FormData) => {
    return apiFn<T>(url, { method: 'POST', body: formData });
  },

  guilds: {
    get: <T>(guildId: string) => typedGet<T>(`/guilds/${guildId}`),
    update: <T>(guildId: string, data: unknown) => apiFn<T>(`/guilds/${guildId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: <T>(guildId: string) => apiFn<T>(`/guilds/${guildId}`, { method: 'DELETE' }),
    getWidget: <T>(guildId: string) => typedGet<T>(`/guilds/${guildId}/widget`),
    updateWidget: <T>(guildId: string, data: unknown) => apiFn<T>(`/guilds/${guildId}/widget`, { method: 'PATCH', body: JSON.stringify(data) }),
    getBoosters: <T>(guildId: string) => typedGet<T>(`/guilds/${guildId}/boosts`),
    boost: <T>(guildId: string) => typedPost<T>(`/guilds/${guildId}/boosts`),
    unboost: <T>(guildId: string) => apiFn<T>(`/guilds/${guildId}/boosts`, { method: 'DELETE' }),
    kickMember: <T>(guildId: string, memberId: string) => apiFn<T>(`/guilds/${guildId}/members/${memberId}`, { method: 'DELETE' }),
    banMember: <T>(guildId: string, memberId: string, reason?: string) =>
      apiFn<T>(`/guilds/${guildId}/bans/${memberId}`, { method: 'PUT', body: JSON.stringify({ reason }) }),
    updateMember: <T>(guildId: string, memberId: string, data: unknown) =>
      apiFn<T>(`/guilds/${guildId}/members/${memberId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    addRole: <T>(guildId: string, memberId: string, roleId: string) =>
      apiFn<T>(`/guilds/${guildId}/members/${memberId}/roles/${roleId}`, { method: 'PUT' }),
    removeRole: <T>(guildId: string, memberId: string, roleId: string) =>
      apiFn<T>(`/guilds/${guildId}/members/${memberId}/roles/${roleId}`, { method: 'DELETE' }),
    getAnalyticsOverview: <T>(guildId: string, period?: string) =>
      typedGet<T>(`/guilds/${guildId}/analytics/overview${period ? `?period=${period}` : ''}`),
    getAnalyticsTimeseries: <T>(guildId: string, metric: string, period: string) =>
      typedGet<T>(`/guilds/${guildId}/analytics/timeseries?metric=${metric}&period=${period}`),
    getAnalyticsHourly: <T>(guildId: string, period: string) =>
      typedGet<T>(`/guilds/${guildId}/analytics/hourly?period=${period}`),
    getAnalyticsRetention: <T>(guildId: string) =>
      typedGet<T>(`/guilds/${guildId}/analytics/retention`),
    getVoiceStates: <T>(guildId: string) => typedGet<T>(`/guilds/${guildId}/voice-states`),
    updateMyVoiceState: <T>(guildId: string, data: unknown) =>
      apiFn<T>(`/guilds/${guildId}/voice-states/@me`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateUserVoiceState: <T>(guildId: string, userId: string, data: unknown) =>
      apiFn<T>(`/guilds/${guildId}/voice-states/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    getSoundboardSounds: <T>(guildId: string) => typedGet<T>(`/guilds/${guildId}/soundboard-sounds`),
    playSoundboardSound: <T>(guildId: string, soundId: string, data?: unknown) =>
      typedPost<T>(`/guilds/${guildId}/soundboard-sounds/${soundId}/play`, data),
  },

  channels: {
    get: <T>(channelId: string) => typedGet<T>(`/channels/${channelId}`),
    create: <T>(data: unknown) => typedPost<T>('/channels', data),
    update: <T>(channelId: string, data: unknown) => apiFn<T>(`/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: <T>(channelId: string) => apiFn<T>(`/channels/${channelId}`, { method: 'DELETE' }),
    getMessages: <T>(channelId: string, params?: { limit?: number; before?: string }) => {
      const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return typedGet<T>(`/channels/${channelId}/messages${query}`);
    },
    createMessage: <T>(channelId: string, data: unknown) => typedPost<T>(`/channels/${channelId}/messages`, data),
    updateMessage: <T>(channelId: string, messageId: string, data: unknown) =>
      apiFn<T>(`/channels/${channelId}/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteMessage: <T>(channelId: string, messageId: string) =>
      apiFn<T>(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' }),
    getInvites: <T>(channelId: string) => typedGet<T>(`/channels/${channelId}/invites`),
    createInvite: <T>(channelId: string, data: unknown) => typedPost<T>(`/channels/${channelId}/invites`, data),
    getPins: <T>(channelId: string) => typedGet<T>(`/channels/${channelId}/messages/pins`),
    searchMessages: <T>(channelId: string, params: { q: string; limit?: number; offset?: number }) => {
      const query = '?' + new URLSearchParams(Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) acc[key] = String(value);
        return acc;
      }, {} as Record<string, string>)).toString();
      return typedGet<T>(`/channels/${channelId}/messages/search${query}`);
    },
    addReaction: <T>(channelId: string, messageId: string, emoji: string, isBurst?: boolean) => {
      const url = `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me${isBurst ? '?type=1' : ''}`;
      return apiFn<T>(url, { method: 'PUT' });
    },
    removeReaction: <T>(channelId: string, messageId: string, emoji: string, isBurst?: boolean) => {
      const url = `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me${isBurst ? '?type=1' : ''}`;
      return apiFn<T>(url, { method: 'DELETE' });
    },
    getReactions: <T>(channelId: string, messageId: string, emoji: string) =>
      typedGet<T>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`),
  },

  users: {
    me: <T>() => typedGet<T>('/users/@me'),
    get: <T>(userId: string) => typedGet<T>(`/users/${userId}`),
    update: <T>(data: unknown) => apiFn<T>('/users/@me', { method: 'PATCH', body: JSON.stringify(data) }),
    deleteMe: <T>(data: unknown) => apiFn<T>('/users/@me', { method: 'DELETE', body: JSON.stringify(data) }),
    getConnections: <T>() => typedGet<T>('/users/@me/connections'),
    getGuilds: <T>() => typedGet<T>('/users/@me/guilds'),
    getMyBoosts: <T>() => typedGet<T>('/users/@me/boosts'),
    createDM: <T>(recipientId: string) => typedPost<T>('/dms', { recipient_id: recipientId }),
    // Sessions and data-export helpers
    getSessions: <T>() => typedGet<T>('/users/@me/sessions'),
    revokeSession: <T>(sessionId: string) => apiFn<T>(`/users/@me/sessions/${sessionId}`, { method: 'DELETE' }),
    requestDataExport: <T>() => typedPost<T>('/users/@me/data-export'),
  },


  invites: {
    get: <T>(inviteCode: string) => typedGet<T>(`/invites/${inviteCode}`),
    accept: <T>(inviteCode: string) => typedPost<T>(`/invites/${inviteCode}`),
    delete: <T>(inviteCode: string) => apiFn<T>(`/invites/${inviteCode}`, { method: 'DELETE' }),
  },

  dm: {
    getGroups: <T>() => typedGet<T>('/dms'),
    createGroup: <T>(data: unknown) => typedPost<T>('/dms/group', data),
    getMessages: <T>(dmId: string, params?: { limit?: number; before?: string }) => {
      const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return typedGet<T>(`/channels/${dmId}/messages${query}`);
    },
    createMessage: <T>(dmId: string, data: unknown) => typedPost<T>(`/channels/${dmId}/messages`, data),
  },

  friends: {
    get: <T>() => typedGet<T>('/relationships'),
    add: <T>(userId: string) => typedPost<T>('/relationships', { user_id: userId }),
    remove: <T>(userId: string) => apiFn<T>(`/relationships/${userId}`, { method: 'DELETE' }),
    accept: <T>(userId: string) => typedPost<T>(`/relationships/accept/${userId}`),
    reject: <T>(userId: string) => typedPost<T>(`/relationships/decline/${userId}`),
    block: <T>(userId: string) => apiFn<T>(`/relationships/${userId}/block`, { method: 'PUT' }),
    unblock: <T>(userId: string) => apiFn<T>(`/relationships/${userId}/block`, { method: 'DELETE' }),
  },

  reports: {
    create: <T>(data: unknown) => typedPost<T>('/reports', data),
    getStats: <T>() => typedGet<T>('/admin/reports/stats'),
  },

  premium: {
    getTiers: <T>() => typedGet<T>('/premium/tiers'),
    getMySubscription: <T>() => typedGet<T>('/premium/subscription'),
    subscribe: <T>() => typedPost<T>('/premium/subscribe'),
    createCheckout: <T>() => typedPost<T>('/premium/checkout'),
    createPortal: <T>() => typedPost<T>('/premium/portal'),
    cancel: <T>() => apiFn<T>('/premium/subscription', { method: 'DELETE' }),
    getMyBoosts: <T>() => typedGet<T>('/users/@me/boosts'),
  },

  admin: {
    getUsers: <T>(params?: { search?: string; limit?: number; offset?: number; page?: number; status?: string }) =>
      typedGet<T>(`/admin/users${buildPagedQuery(params)}`),
    getGuilds: <T>(params?: { search?: string; limit?: number; offset?: number; page?: number }) =>
      typedGet<T>(`/admin/guilds${buildPagedQuery(params)}`),
    getStats: <T>() => typedGet<T>('/admin/stats'),
    getStatsCharts: <T>() => typedGet<T>('/admin/stats/charts'),
    getRecentAuditActivity: <T>() => typedGet<T>('/admin/stats/activity'),
    getReports: <T>(params?: { limit?: number; offset?: number; page?: number; status?: string; target_type?: string }) =>
      typedGet<T>(`/admin/reports${buildPagedQuery(params)}`),
    resolveReport: <T>(reportId: string, data: unknown) => typedPost<T>(`/admin/reports/${reportId}/resolve`, data),
    dismissReport: <T>(reportId: string) => typedPost<T>(`/admin/reports/${reportId}/dismiss`),
    getAuditLogs: <T>(params?: { limit?: number; offset?: number; page?: number; action?: string; target_type?: string }) =>
      typedGet<T>(`/admin/audit-logs${buildPagedQuery(params)}`),
    getAnnouncements: <T>() => typedGet<T>('/admin/announcements'),
    createAnnouncement: <T>(data: unknown) => typedPost<T>('/admin/announcements', data),
    updateAnnouncement: <T>(id: string, data: unknown) =>
      apiFn<T>(`/admin/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteAnnouncement: <T>(id: string) => apiFn<T>(`/admin/announcements/${id}`, { method: 'DELETE' }),
    getSettings: <T>() => typedGet<T>('/admin/settings'),
    updateSettings: <T>(data: unknown) => apiFn<T>('/admin/settings', { method: 'PATCH', body: JSON.stringify(data) }),
    getBackups: <T>() => typedGet<T>('/admin/backups'),
    createBackup: <T>() => typedPost<T>('/admin/backups'),
    restoreBackup: <T>(backupId: string) => typedPost<T>(`/admin/backups/${backupId}/restore`),
    deleteBackup: <T>(backupId: string) => apiFn<T>(`/admin/backups/${backupId}`, { method: 'DELETE' }),
    getBadges: <T>() => typedGet<T>('/admin/badges'),
    createBadge: <T>(data: unknown) => typedPost<T>('/admin/badges', data),
    updateBadge: <T>(badgeId: string, data: unknown) =>
      apiFn<T>(`/admin/badges/${badgeId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteBadge: <T>(badgeId: string) => apiFn<T>(`/admin/badges/${badgeId}`, { method: 'DELETE' }),
    getPlugins: <T>() => typedGet<T>('/admin/plugins'),
    installPlugin: <T>(data: unknown) => typedPost<T>('/admin/plugins/install', data),
    uninstallPlugin: <T>(pluginId: string) => typedPost<T>(`/admin/plugins/${pluginId}/uninstall`),
    bulkUsers: <T>(action: string, ids: string[], reason?: string) =>
      typedPost<T>('/admin/users/bulk', { action, ids, reason }),
    bulkGuilds: <T>(action: string, ids: string[], reason?: string) =>
      typedPost<T>('/admin/guilds/bulk', { action, ids, reason }),
    bulkReports: <T>(action: string, ids: string[]) =>
      typedPost<T>('/admin/reports/bulk', { action, ids }),
    bulkAnnouncements: <T>(action: string, ids: string[]) =>
      typedPost<T>('/admin/announcements/bulk', { action, ids }),
    bulkBadges: <T>(action: string, ids: string[]) =>
      typedPost<T>('/admin/badges/bulk', { action, ids }),
    bulkBackups: <T>(action: string, ids: string[]) =>
      typedPost<T>('/admin/backups/bulk', { action, ids }),
    bulkPlugins: <T>(action: string, ids: string[]) =>
      typedPost<T>('/admin/plugins/bulk', { action, ids }),
  },

  announcements: {
    getActive: <T>() => typedGet<T>('/announcements/active'),
  },

  discovery: {
    listGuilds: <T>(params?: { page?: number; limit?: number }) => {
      const query = buildQuery(params);
      return typedGet<T>(`/discover${query}`);
    },
    getCategories: <T>() => typedGet<T>('/discover/categories'),
    joinGuild: <T>(guildId: string) => typedPost<T>(`/discover/${guildId}/join`),
  },

  stickers: {
    getPacks: <T>() => typedGet<T>('/sticker-packs'),
    getGuildStickers: <T>(guildId: string) => typedGet<T>(`/guilds/${guildId}/stickers`),
    create: <T>(guildId: string, data: FormData) => {
      const url = normalizeUrl(`/guilds/${guildId}/stickers`);
      return apiFn<T>(url, { method: 'POST', body: data as any, headers: {} });
    },
    delete: <T>(guildId: string, stickerId: string) =>
      apiFn<T>(`/guilds/${guildId}/stickers/${stickerId}`, { method: 'DELETE' }),
  },

  forumTags: {
    get: <T>(guildId: string, channelId: string) => typedGet<T>(`/guilds/${guildId}/channels/${channelId}/tags`),
    create: <T>(guildId: string, channelId: string, data: { name: string; emoji?: string; moderated?: boolean }) =>
      typedPost<T>(`/guilds/${guildId}/channels/${channelId}/tags`, data),
    update: <T>(guildId: string, channelId: string, tagId: string, data: { name?: string; emoji?: string; moderated?: boolean }) =>
      apiFn<T>(`/guilds/${guildId}/channels/${channelId}/tags/${tagId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: <T>(guildId: string, channelId: string, tagId: string) =>
      apiFn<T>(`/guilds/${guildId}/channels/${channelId}/tags/${tagId}`, { method: 'DELETE' }),
  },

  connected_accounts: {
    // GET /api/connected-accounts -> returns an array of connected accounts
    get: <T>() => typedGet<T>('/connected-accounts'),
    add: <T>(data: { platform: string; platform_user_id: string; platform_username?: string }) =>
      typedPost<T>('/connected-accounts', data),
    remove: <T>(accountId: string) =>
      apiFn<T>(`/connected-accounts/${accountId}`, { method: 'DELETE' }),
  },


  notes: {
    getAll: <T>() => typedGet<T>('/users/@me/notes'),
    getForUser: <T>(targetId: string) => typedGet<T>(`/users/@me/notes/${targetId}`),
    upsert: <T>(targetId: string, content: string) =>
      apiFn<T>(`/users/@me/notes/${targetId}`, { method: 'POST', body: JSON.stringify({ content }) }),
    delete: <T>(targetId: string) =>
      apiFn<T>(`/users/@me/notes/${targetId}`, { method: 'DELETE' }),
  },

  plugins: {
    list: <T>() => typedGet<T>('/plugins'),
    getUserSettings: <T>() => typedGet<T>('/users/@me/plugins'),
    saveUserSettings: <T>(slug: string, data: any) => typedPost<T>(`/users/@me/plugins/${slug}`, data),
    getGuildSettings: <T>(guildId: string) => typedGet<T>(`/plugins/guild-settings/${guildId}`),
    updateGuildSettings: <T>(guildId: string, slug: string, data: any) => typedPost<T>(`/plugins/guild-settings/${guildId}/${slug}`, data),
  },

  applications: {
    list: <T>() => typedGet<T>('/applications'),
    create: <T>(data: any) => typedPost<T>('/applications', data),
    createBot: <T>(applicationId: string) => typedPost<T>(`/applications/${applicationId}/bot`),
  },

  slashCommands: {
    listCommands: <T>(guildId: string) => typedGet<T>(`/guilds/${guildId}/slash-commands`),
    executeCommand: <T>(guildId: string, data: { command_id: string; channel_id: string; guild_id: string; options?: unknown }) =>
      typedPost<T>(`/guilds/${guildId}/slash-commands/execute`, data),
  },

  oauth: {
    authorize: <T>(data: unknown) => typedPost<T>('/oauth2/authorize', data),
  },

  auth: {
    resetPassword: <T>(data: unknown) => typedPost<T>('/auth/password/reset', data),
  },
});
