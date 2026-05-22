import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import '../Auth/Auth.module.css';

export function OAuthAuthorizePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [application, setApplication] = useState<any>(null);
  const [guilds, setGuilds] = useState<any[]>([]);
  const [guildId, setGuildId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const applicationId = params.get('client_id') || '';
  const permissions = params.get('permissions') || '0';
  const scope = params.get('scope') || 'bot';

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (!applicationId) {
      setMessage('Application invalide.');
      setLoading(false);
      return;
    }

    api<any>(`/oauth2/authorize?client_id=${encodeURIComponent(applicationId)}&permissions=${encodeURIComponent(permissions)}&scope=${encodeURIComponent(scope)}`, { method: 'GET' })
      .then((authorizeData) => {
        setApplication({
          ...authorizeData.application,
          bot: authorizeData.bot,
        });
        setGuilds(authorizeData.guilds || []);
        setGuildId(authorizeData.guilds?.[0]?.id || '');
      })
      .catch((err: any) => setMessage(err.message || 'Impossible de charger cette autorisation.'))
      .finally(() => setLoading(false));
  }, [applicationId, isAuthenticated, navigate, permissions, scope]);

  const canAuthorize = useMemo(() => !!application?.bot && !!guildId, [application?.bot, guildId]);

  const handleAuthorize = async () => {
    if (!canAuthorize) return;
    setSubmitting(true);
    setMessage('');
    try {
      await api.oauth.authorize({
        application_id: applicationId,
        guild_id: guildId,
        permissions,
      } as any);
      setMessage('Bot autorisé sur le serveur.');
    } catch (err: any) {
      setMessage(err.message || 'Impossible d\'autoriser ce bot.');
    }
    setSubmitting(false);
  };

  const shellStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    padding: 24,
  };

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 520,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 24,
    boxShadow: 'var(--shadow-high)',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    marginTop: 8,
  };

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Autoriser une application</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Choisissez le serveur sur lequel installer ce bot.
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Chargement…</div>
        ) : (
          <>
            <div style={{ padding: 16, borderRadius: 10, background: 'var(--bg-tertiary)', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{application?.icon || '🤖'}</span>
                <span>{application?.name || 'Application inconnue'}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                {application?.description || 'Aucune description fournie.'}
              </div>
              {!application?.bot && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Cette application n’a pas encore de bot associé.
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Serveur</div>
            <select style={inputStyle} value={guildId} onChange={(e) => setGuildId(e.target.value)}>
              {guilds.map((guild) => (
                <option key={guild.id} value={guild.id}>{guild.name}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: 'var(--bg-accent)', color: 'white', fontWeight: 700, cursor: canAuthorize ? 'pointer' : 'not-allowed', opacity: canAuthorize ? 1 : 0.6 }}
                onClick={handleAuthorize}
                disabled={!canAuthorize || submitting}
              >
                {submitting ? 'Autorisation…' : 'Autoriser'}
              </button>
              <button
                style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)' }}
                onClick={() => navigate('/channels/@me')}
              >
                Fermer
              </button>
            </div>

            {message && <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>{message}</div>}
          </>
        )}
      </div>
    </div>
  );
}
