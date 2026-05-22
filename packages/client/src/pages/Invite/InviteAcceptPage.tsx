import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';

export function InviteAcceptPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addGuild = useGuildStore((s) => s.addGuild);
  const fetchGuild = useGuildStore((s) => s.fetchGuild);
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

    api(`/api/invites/${code}?with_counts=true&with_expiration=true`)
      .then((data) => setInvite(data))
      .catch((err: any) => setError(err?.message || 'Invitation introuvable.'))
      .finally(() => setLoading(false));
  }, [code]);

  const handleJoin = useCallback(async () => {
    if (!code) return;
    if (!isAuthenticated) {
      localStorage.setItem('pendingInviteCode', code);
      navigate(`/login?redirect=${encodeURIComponent(`/invite/${code}`)}`, { state: { redirectTo: `/invite/${code}` } });
      return;
    }

    setJoining(true);
    setError('');
    try {
      const result = await api<any>(`/api/invites/${code}`, { method: 'POST' });
      const guildId = result?.guild?.id;
      if (!guildId) throw new Error('Invitation invalide.');
      try {
        const guild = await fetchGuild(guildId);
        addGuild(guild as any);
      } catch {
        if (result.guild) addGuild(result.guild as any);
      }
      localStorage.removeItem('pendingInviteCode');
      selectGuild(guildId);
      navigate('/channels');
    } catch (err: any) {
      setError(err?.message || 'Impossible de rejoindre ce serveur.');
    } finally {
      setJoining(false);
    }
  }, [addGuild, code, fetchGuild, isAuthenticated, navigate, selectGuild]);

  useEffect(() => {
    if (!code || !isAuthenticated || loading || joining || error) return;
    if (localStorage.getItem('pendingInviteCode') === code) {
      void handleJoin();
    }
  }, [code, error, handleJoin, isAuthenticated, joining, loading]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#313338', color: 'var(--text-primary)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440, borderRadius: 8, background: '#2b2d31', padding: 32, textAlign: 'center', boxShadow: 'var(--shadow-high)' }}>
        <div style={{ width: 82, height: 82, margin: '0 auto 18px', borderRadius: 24, background: 'var(--bg-accent)', display: 'grid', placeItems: 'center', overflow: 'hidden', fontSize: 34, fontWeight: 800, color: 'white' }}>
          {invite?.guild?.icon ? <img src={invite.guild.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (invite?.guild?.name || '?').slice(0, 1).toUpperCase()}
        </div>
        <h1 style={{ margin: 0, fontSize: 16, color: 'var(--text-muted)', fontWeight: 600 }}>Vous avez été invité à rejoindre un serveur</h1>
        {loading && <p style={{ color: 'var(--text-muted)' }}>Chargement de l'invitation…</p>}
        {!loading && error && <p style={{ color: '#ED4245' }}>{error}</p>}
        {!loading && !error && invite && (
          <>
            <h2 style={{ margin: '10px 0 8px', fontSize: 26 }}>{invite.guild?.name || 'Serveur'}</h2>
            {invite.guild?.description && <p style={{ color: 'var(--text-muted)', margin: '0 0 12px' }}>{invite.guild.description}</p>}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, color: 'var(--text-muted)', fontSize: 13, marginBottom: 18 }}>
              <span>{invite.guild?.approximate_member_count ?? 0} membres</span>
              <span>#{invite.channel?.name || 'général'}</span>
            </div>
            <button
              onClick={handleJoin}
              disabled={joining}
              data-testid="invite-accept-submit"
              style={{ marginTop: 8, width: '100%', height: 44, border: 0, borderRadius: 4, cursor: joining ? 'default' : 'pointer', background: '#5865F2', color: 'white', fontWeight: 700 }}
            >
              {joining ? 'Connexion…' : 'Rejoindre le serveur'}
            </button>
            {invite.expires_at && <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 12 }}>Expire le {new Date(invite.expires_at).toLocaleString()}</div>}
          </>
        )}
      </div>
    </div>
  );
}
