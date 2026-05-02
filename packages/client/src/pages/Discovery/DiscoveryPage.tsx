import { useEffect, useMemo, useState } from 'react';
import { Compass, Sparkles, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface DiscoverableGuild {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  description: string | null;
  premium_tier: number;
  member_count: number;
}

export function DiscoveryPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [guilds, setGuilds] = useState<DiscoverableGuild[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchMe().catch(() => undefined);
    api.discovery.listGuilds<{ guilds: DiscoverableGuild[] }>({ limit: 48 })
      .then((data) => setGuilds(data.guilds || []))
      .catch((err: any) => setError(err.message || 'Impossible de charger la découverte.'))
      .finally(() => setLoading(false));
  }, [fetchMe, isAuthenticated, navigate]);

  const filteredGuilds = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return guilds;
    return guilds.filter((guild) =>
      guild.name.toLowerCase().includes(normalized) ||
      guild.description?.toLowerCase().includes(normalized),
    );
  }, [guilds, query]);

  const handleJoin = async (guild: DiscoverableGuild) => {
    setJoiningId(guild.id);
    setError('');
    try {
      await api.discovery.joinGuild(guild.id);
      navigate('/channels/@me');
    } catch (err: any) {
      setError(err.message || 'Impossible de rejoindre ce serveur.');
    }
    setJoiningId(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '32px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Compass size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '32px', fontWeight: 800 }}>Découverte</div>
            <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Parcourez des communautés publiques et rejoignez-les directement.</div>
          </div>
          <button
            style={{ padding: '10px 16px', borderRadius: '8px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 600 }}
            onClick={() => navigate('/channels/@me')}
          >
            Retour à l’app
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un serveur..."
            style={{ flex: 1, padding: '14px 16px', borderRadius: '10px', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          />
          <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--bg-secondary)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {filteredGuilds.length} résultats
          </div>
        </div>

        {error && <div style={{ marginBottom: '16px', color: 'var(--text-danger)' }}>{error}</div>}
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Chargement…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {filteredGuilds.map((guild) => (
              <div key={guild.id} style={{ background: 'var(--bg-primary)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div
                  style={{
                    height: '120px',
                    background: guild.banner
                      ? `center / cover no-repeat url(${guild.banner})`
                      : 'linear-gradient(135deg, rgba(88,101,242,0.9), rgba(88,101,242,0.45))',
                  }}
                />
                <div style={{ padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '-42px', marginBottom: '12px' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '20px', overflow: 'hidden', background: 'var(--bg-secondary)', border: '4px solid var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                      {guild.icon ? <img src={guild.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : guild.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{guild.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Users size={14} />{guild.member_count}</span>
                        {guild.premium_tier > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Sparkles size={14} />Tier {guild.premium_tier}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ minHeight: '48px', color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
                    {guild.description || 'Aucune description renseignée.'}
                  </div>

                  <button
                    disabled={joiningId === guild.id}
                    onClick={() => handleJoin(guild)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: 'var(--bg-accent)',
                      color: 'white',
                      fontWeight: 700,
                      cursor: 'pointer',
                      opacity: joiningId === guild.id ? 0.75 : 1,
                    }}
                  >
                    {joiningId === guild.id ? 'Connexion…' : 'Rejoindre'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
