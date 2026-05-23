import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLayout } from './Admin/AdminLayout';
import { DiscoveryPage } from './Discovery/DiscoveryPage';
import { PremiumPage } from './PremiumPage/PremiumPage';
import { InviteAcceptPage } from './Invite/InviteAcceptPage';
import { useAuthStore } from '../stores/authStore';

vi.mock('../services/api', () => ({
  api: Object.assign(
    vi.fn(async (url: string) => {
      if (url === '/api/premium/tiers') {
        return {
          tiers: [
            {
              id: 1,
              name: 'Starter',
              features: ['Uploads'],
              price_cents: 499,
              currency: 'EUR',
            },
          ],
        };
      }

      if (url === '/api/premium/subscription') {
        return { subscription: null };
      }

      if (url.startsWith('/api/invites/smoke-invite')) {
        return {
          guild: { name: 'Smoke Guild' },
          channel: { name: 'general' },
        };
      }

      throw new Error(`Unexpected api call: ${url}`);
    }),
    {
      discovery: {
        listGuilds: vi.fn(async () => ({
          guilds: [
            {
              id: 'guild-1',
              name: 'Smoke Guild',
              icon: null,
              banner: null,
              description: 'Guild used by smoke tests',
              premium_tier: 0,
              member_count: 2,
            },
          ],
        })),
        joinGuild: vi.fn(),
      },
    },
  ),
}));

describe('top-level route smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 'admin-1',
        username: 'admin',
        discriminator: '0001',
        email: 'admin@opencord.test',
        avatar: null,
        banner: null,
        bio: null,
        global_name: 'Admin',
        status: 'online',
        custom_status_text: null,
        locale: 'fr',
        theme: 'dark',
        admin_level: 2,
        two_factor_enabled: false,
        premium: false,
        created_at: new Date().toISOString(),
      } as any,
      relationships: [],
      isAuthenticated: true,
      fetchMe: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders the admin layout for an authenticated admin', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<div>Dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Panel Admin')).toBeInTheDocument();
    expect(screen.getByText('Utilisateurs')).toBeInTheDocument();
    expect(screen.getByText('Sauvegardes')).toBeInTheDocument();
  });

  it('renders the discovery page with fetched guilds', async () => {
    render(
      <MemoryRouter initialEntries={['/discover']}>
        <Routes>
          <Route path="/discover" element={<DiscoveryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Découverte')).toBeInTheDocument();
    expect(await screen.findByText('Smoke Guild')).toBeInTheDocument();
  });

  it('renders the premium page with tiers', async () => {
    render(
      <MemoryRouter initialEntries={['/premium']}>
        <Routes>
          <Route path="/premium" element={<PremiumPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('OpenCord Premium')).toBeInTheDocument();
    expect(await screen.findByText('Starter')).toBeInTheDocument();
  });

  it('renders the invite accept page for a valid invite code', async () => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      relationships: [],
      fetchMe: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <MemoryRouter initialEntries={['/invite/smoke-invite']}>
        <Routes>
          <Route path="/invite/:code" element={<InviteAcceptPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Vous avez été invité à rejoindre un serveur')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Smoke Guild')).toBeInTheDocument());
    expect(screen.getByTestId('invite-accept-submit')).toBeInTheDocument();
  });
});
