import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  friendsGet: vi.fn(),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

vi.mock('../services/api', () => ({
  api: Object.assign(mocks.api, {
    friends: {
      get: mocks.friendsGet,
    },
  }),
  setTokens: mocks.setTokens,
  clearTokens: mocks.clearTokens,
}));

import { useAuthStore } from './authStore';

const baseUser = {
  id: 'user-1',
  username: 'johnny',
  discriminator: '1234',
  email: 'johnny@opencord.test',
  avatar: null,
  banner: null,
  bio: null,
  global_name: 'Johnny',
  status: 'online',
  custom_status_text: null,
  locale: 'fr',
  theme: 'dark',
  admin_level: 0,
  two_factor_enabled: false,
  premium: false,
  created_at: '2026-05-20T12:00:00.000Z',
};

function resetAuthStore() {
  useAuthStore.setState({
    user: null,
    relationships: [],
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });
}

describe('authStore', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.friendsGet.mockReset();
    mocks.setTokens.mockReset();
    mocks.clearTokens.mockReset();
    resetAuthStore();
  });

  it('logs in successfully and stores the user session', async () => {
    mocks.api.mockResolvedValue({
      user: baseUser,
      relationships: [{ id: 'rel-1', type: 1, user: { id: 'friend-1', username: 'amy', discriminator: '0001', avatar: null } }],
    });

    await expect(useAuthStore.getState().login(baseUser.email, 'Passw0rd!123')).resolves.toEqual({});

    expect(mocks.api).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: baseUser.email, password: 'Passw0rd!123' }),
    });
    expect(mocks.setTokens).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe(baseUser.id);
    expect(useAuthStore.getState().relationships).toHaveLength(1);
  });

  it('handles the 2FA intermediate login flow without authenticating the user', async () => {
    mocks.api.mockResolvedValue({
      two_factor_required: true,
      partial_token: 'partial-1',
    });

    await expect(useAuthStore.getState().login(baseUser.email, 'Passw0rd!123')).resolves.toEqual({
      twoFactorRequired: true,
      partialToken: 'partial-1',
    });

    expect(mocks.setTokens).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('clears the session on logout even if the API call fails', async () => {
    useAuthStore.setState({
      user: baseUser,
      relationships: [{ id: 'rel-1', type: 1, user: { id: 'friend-1', username: 'amy', discriminator: '0001', avatar: null } }],
      isAuthenticated: true,
    });
    mocks.api.mockRejectedValue(new Error('network'));

    await useAuthStore.getState().logout();

    expect(mocks.clearTokens).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().relationships).toEqual([]);
  });

  it('hydrates relationships during fetchMe, keeps the current state on 401, and clears it on other errors', async () => {
    useAuthStore.setState({ user: baseUser, isAuthenticated: true });
    mocks.api.mockResolvedValueOnce(baseUser);
    mocks.friendsGet
      .mockResolvedValueOnce({
        relationships: [{ id: 'rel-1', type: 1, user: { id: 'friend-1', username: 'amy', discriminator: '0001', avatar: null } }],
      })
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    mocks.api
      .mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { status: 401 }))
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));

    await useAuthStore.getState().fetchMe();
    expect(useAuthStore.getState().user?.id).toBe(baseUser.id);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().relationships).toHaveLength(1);

    await useAuthStore.getState().fetchMe();
    expect(useAuthStore.getState().user?.id).toBe(baseUser.id);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    await useAuthStore.getState().fetchMe();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('upserts and removes relationships by user id', () => {
    useAuthStore.getState().upsertRelationship({
      id: 'rel-1',
      type: 1,
      user: { id: 'friend-1', username: 'amy', discriminator: '0001', avatar: null },
    });
    useAuthStore.getState().upsertRelationship({
      id: 'rel-1',
      type: 2,
      user: { id: 'friend-1', username: 'amy-updated', discriminator: '0001', avatar: null },
    });

    expect(useAuthStore.getState().relationships).toEqual([
      expect.objectContaining({
        id: 'rel-1',
        type: 2,
        user: expect.objectContaining({ id: 'friend-1', username: 'amy-updated', discriminator: '0001' }),
      }),
    ]);

    useAuthStore.getState().removeRelationshipByUserId('friend-1');
    expect(useAuthStore.getState().relationships).toEqual([]);
  });
});
