const API_URL = import.meta.env.VITE_API_URL || '';
const API_PREFIX = '/api';
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

let accessToken: string | null = localStorage.getItem('access_token');
let refreshToken: string | null = localStorage.getItem('refresh_token');

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function getAccessToken(): string | null {
  return accessToken;
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

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(resolveUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
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

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  return headers;
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...getHeaders(), ...(options.headers as Record<string, string> || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  let res = await fetch(resolveUrl(url), { ...options, headers });

  if (res.status === 401 && accessToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(resolveUrl(url), { ...options, headers });
    } else {
      clearTokens();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  return res;
}

// ── Core typed function (callable as `api<T>(url, options?)`) ─────────────────

async function apiFn<T>(url: string, options?: RequestInit): Promise<T> {
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
      const headers = getHeaders();
      delete headers['Content-Type'];
      return apiFn<T>(url, { method: 'POST', headers, body: formData });
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
    getPins: <T>(channelId: string) => typedGet<T>(`/channels/${channelId}/pins`),
    searchMessages: <T>(channelId: string, params: { q: string; limit?: number; offset?: number }) => {
      const query = '?' + new URLSearchParams(Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) acc[key] = String(value);
        return acc;
      }, {} as Record<string, string>)).toString();
      return typedGet<T>(`/channels/${channelId}/messages/search${query}`);
    },
    addReaction: <T>(channelId: string, messageId: string, emoji: string) =>
      apiFn<T>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, { method: 'PUT' }),
    removeReaction: <T>(channelId: string, messageId: string, emoji: string) =>
      apiFn<T>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, { method: 'DELETE' }),
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
  },

  invites: {
    get: <T>(inviteCode: string) => typedGet<T>(`/invites/${inviteCode}`),
    accept: <T>(inviteCode: string) => typedPost<T>(`/invites/${inviteCode}`),
    delete: <T>(inviteCode: string) => apiFn<T>(`/invites/${inviteCode}`, { method: 'DELETE' }),
  },

  dm: {
    getGroups: <T>() => typedGet<T>('/dm/groups'),
    createGroup: <T>(data: unknown) => typedPost<T>('/dm/groups', data),
    getMessages: <T>(dmId: string, params?: { limit?: number; before?: string }) => {
      const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return typedGet<T>(`/dm/${dmId}/messages${query}`);
    },
    createMessage: <T>(dmId: string, data: unknown) => typedPost<T>(`/dm/${dmId}/messages`, data),
  },

  friends: {
    get: <T>() => typedGet<T>('/users/@me/relationships'),
    add: <T>(userId: string) => typedPost<T>('/users/@me/relationships', { user_id: userId }),
    remove: <T>(userId: string) => apiFn<T>(`/users/@me/relationships/${userId}`, { method: 'DELETE' }),
    accept: <T>(userId: string) => apiFn<T>(`/users/@me/relationships/${userId}`, { method: 'PUT' }),
    reject: <T>(userId: string) => typedPost<T>(`/users/@me/relationships/${userId}/decline`),
    block: <T>(userId: string) => apiFn<T>(`/users/@me/relationships/${userId}/block`, { method: 'PUT' }),
    unblock: <T>(userId: string) => apiFn<T>(`/users/@me/relationships/${userId}/block`, { method: 'DELETE' }),
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

  plugins: {
    list: <T>() => typedGet<T>('/plugins'),
    get: <T>(slug: string) => typedGet<T>(`/plugins/${slug}`),
    getUserSettings: <T>() => typedGet<T>('/users/@me/plugins'),
    updateUserSettings: <T>(slug: string, data: unknown) =>
      apiFn<T>(`/users/@me/plugins/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
    getGuildSettings: <T>(guildId: string) => typedGet<T>(`/guilds/${guildId}/plugins`),
    updateGuildSettings: <T>(guildId: string, slug: string, data: unknown) =>
      apiFn<T>(`/guilds/${guildId}/plugins/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  applications: {
    list: <T>() => typedGet<T>('/applications'),
    create: <T>(data: unknown) => typedPost<T>('/applications', data),
    get: <T>(applicationId: string) => typedGet<T>(`/applications/${applicationId}`),
    createBot: <T>(applicationId: string) => typedPost<T>(`/applications/${applicationId}/bot`),
  },

  oauth: {
    authorize: <T>(data: unknown) => typedPost<T>('/oauth2/authorize', data),
  },

  auth: {
    login: <T>(data: unknown) => typedPost<T>('/auth/login', data),
    register: <T>(data: unknown) => typedPost<T>('/auth/register', data),
    logout: () => apiFn('/auth/logout', { method: 'POST' }),
    refresh: <T>(refreshToken: string) => apiFn<T>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }),
    changePassword: <T>(data: unknown) => apiFn<T>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
    requestPasswordReset: <T>(data: unknown) => apiFn<T>('/auth/password/reset-request', { method: 'POST', body: JSON.stringify(data) }),
    resetPassword: <T>(data: unknown) => apiFn<T>('/auth/password/reset', { method: 'POST', body: JSON.stringify(data) }),
    enable2FA: <T>(data: unknown) => apiFn<T>('/auth/2fa/enable', { method: 'POST', body: JSON.stringify(data) }),
    verify2FA: <T>(data: unknown) => apiFn<T>('/auth/2fa/verify', { method: 'POST', body: JSON.stringify(data) }),
    disable2FA: <T>(data: unknown) => apiFn<T>('/auth/2fa/disable', { method: 'POST', body: JSON.stringify(data) }),
    login2FA: <T>(data: unknown) => apiFn<T>('/auth/2fa/login', { method: 'POST', body: JSON.stringify(data) }),
    getSessions: <T>() => typedGet<T>('/auth/sessions'),
    deleteSession: (sessionId: string) => apiFn(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),
  },
});
