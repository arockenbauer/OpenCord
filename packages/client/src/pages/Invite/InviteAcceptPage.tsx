import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';

export function InviteAcceptPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addGuild = useGuildStore((s) => s.addGuild);
  const selectGuild = useGuildStore((s) => s.selectGuild);

  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) {
      setError('Code d\'invitation invalide.');
      setLoading(false);
      return;
    }

    api(`/api/invites/${code}`)
      .then((data) => setInvite(data))
      .catch((err: any) => setError(err?.message || 'Invitation introuvable.'))
      .finally(() => setLoading(false));
  }, [code]);

  const handleJoin = async () => {
    if (!code) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setJoining(true);
    setError('');
    try {
      const guild = await api(`/api/invites/${code}`, { method: 'POST' });
      addGuild(guild as any);
      selectGuild((guild as any).id);
      navigate('/channels/@me');
    } catch (err: any) {
      setError(err?.message || 'Impossible de rejoindre ce serveur.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 460, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-secondary)', padding: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Invitation serveur</h1>
        {loading && <p style={{ color: 'var(--text-muted)' }}>Chargement de l'invitation…</p>}
        {!loading && error && <p style={{ color: '#ED4245' }}>{error}</p>}
        {!loading && !error && invite && (
          <>
            <p style={{ color: 'var(--text-muted)' }}>Vous êtes invité à rejoindre</p>
            <h2 style={{ marginTop: 4 }}>{invite.guild?.name || 'Serveur'}</h2>
            <p style={{ color: 'var(--text-muted)' }}>Salon: {invite.channel?.name || 'général'}</p>
            <button
              onClick={handleJoin}
              disabled={joining}
              data-testid="invite-accept-submit"
              style={{ marginTop: 8, width: '100%', height: 42, border: 0, borderRadius: 8, cursor: joining ? 'default' : 'pointer', background: '#5865F2', color: 'white', fontWeight: 600 }}
            >
              {joining ? 'Connexion…' : 'Rejoindre le serveur'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
