import { create } from 'zustand';
import { api, setTokens, clearTokens } from '../services/api';

interface User {
  id: string;
  username: string;
  discriminator: string;
  email: string;
  avatar: string | null;
  banner: string | null;
  bio: string | null;
  global_name: string | null;
  status: string;
  custom_status_text: string | null;
  custom_status_emoji?: string | null;
  locale: string;
  theme: string;
  admin_level: number;
  two_factor_enabled: boolean;
  premium: boolean;
  created_at: string;
  [key: string]: any;
}

export interface Relationship {
  id: string;
  type: number;
  user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    status?: string;
    global_name?: string | null;
    custom_status_text?: string | null;
    [key: string]: any;
  };
}

interface AuthState {
  user: User | null;
  relationships: Relationship[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ twoFactorRequired?: boolean; partialToken?: string }>;
  register: (data: { email: string; username: string; password: string; date_of_birth: string }) => Promise<void>;
  twoFactorLogin: (code: string, partialToken: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  setUser: (user: User) => void;
  setRelationships: (relationships: Relationship[]) => void;
  upsertRelationship: (relationship: Partial<Relationship> & { id: string; type: number; user?: Relationship['user'] }) => void;
  removeRelationshipByUserId: (userId: string) => void;
  updateRelationshipPresence: (userId: string, status: string) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  relationships: [],
  isAuthenticated: false, // Will be set to true after successful login or fetchMe
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api<any>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (data.two_factor_required) {
        set({ isLoading: false });
        return { twoFactorRequired: true, partialToken: data.partial_token };
      }

      setTokens();
      set({ user: data.user, relationships: data.relationships || [], isAuthenticated: true, isLoading: false });
      return {};
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api<any>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setTokens();
      set({ user: res.user, relationships: res.relationships || [], isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  twoFactorLogin: async (code, partialToken) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api<any>('/api/auth/2fa/login', {
        method: 'POST',
        body: JSON.stringify({ code, partial_token: partialToken }),
      });
      setTokens();
      set({ user: data.user, relationships: data.relationships || [], isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {}
    clearTokens();
    set({ user: null, relationships: [], isAuthenticated: false });
  },

  fetchMe: async () => {
    try {
      const [user, relationshipsResponse] = await Promise.all([
        api<any>('/api/users/@me'),
        api.friends.get<{ relationships: Relationship[] }>()
          .catch(() => ({ relationships: [] })),
      ]);
      set({ user, relationships: relationshipsResponse.relationships || [], isAuthenticated: true });
    } catch (err: any) {
      // Don't immediately logout on 401, let the user retry
      if (err.status !== 401) {
        set({ user: null, relationships: [], isAuthenticated: false });
      }
    }
  },

  updateUser: async (data) => {
    const user = await api<any>('/api/users/@me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    set({ user });
  },

  setUser: (user) => set({ user }),
  setRelationships: (relationships) => set({ relationships }),
  upsertRelationship: (relationship) => set((state) => {
    const index = state.relationships.findIndex((item) => item.id === relationship.id || item.user.id === relationship.user?.id);
    if (index === -1) {
      if (!relationship.user) return { relationships: state.relationships };
      return { relationships: [...state.relationships, relationship as Relationship] };
    }

    const existing = state.relationships[index]!;
    const next = [...state.relationships];
    next[index] = {
      ...existing,
      ...relationship,
      user: relationship.user ? { ...existing.user, ...relationship.user } : existing.user,
    };
    return { relationships: next };
  }),
  removeRelationshipByUserId: (userId) => set((state) => ({
    relationships: state.relationships.filter((relationship) => relationship.user.id !== userId),
  })),
  updateRelationshipPresence: (userId, status) => set((state) => ({
    relationships: state.relationships.map((relationship) => relationship.user.id === userId
      ? { ...relationship, user: { ...relationship.user, status } }
      : relationship),
  })),
  clearError: () => set({ error: null }),
}));
