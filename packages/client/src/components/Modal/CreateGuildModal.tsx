import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, modalStyles } from './Modal';
import { useGuildStore } from '../../stores/guildStore';
import { useUIStore } from '../../stores/uiStore';
import { api } from '../../services/api';

export function CreateGuildModal() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const createGuild = useGuildStore((s) => s.createGuild);
  const addGuild = useGuildStore((s) => s.addGuild);
  const fetchGuild = useGuildStore((s) => s.fetchGuild);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const setShowCreateGuild = useUIStore((s) => s.setShowCreateGuild);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const guild = await createGuild(name.trim());
      selectGuild(guild.id);
      setShowCreateGuild(false);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    const code = extractInviteCode(inviteInput);
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.invites.accept<any>(code);
      const guildId = result?.guild?.id;
      if (!guildId) throw new Error('Invitation invalide');
      try {
        const guild = await fetchGuild(guildId);
        addGuild(guild);
      } catch {
        addGuild({
          ...(result.guild || {}),
          id: guildId,
          channels: [],
          roles: [],
          members: [],
          emojis: [],
        } as any);
      }
      selectGuild(guildId);
      setShowCreateGuild(false);
    } catch (err: any) {
      setError(err.message || 'Impossible de rejoindre ce serveur');
    }
    setLoading(false);
  };

  return (
    <Modal onClose={() => setShowCreateGuild(false)}>
      <div className={modalStyles.title}>{mode === 'create' ? t('guild.create') : 'Rejoindre un serveur'}</div>
      <div className={modalStyles.subtitle}>
        {mode === 'create'
          ? 'Donnez un nom à votre serveur pour commencer.'
          : 'Collez un lien d’invitation Discord-like ou un code OpenCord.'}
      </div>

      {error && <div className={modalStyles.error}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          className={mode === 'create' ? modalStyles.buttonPrimary : modalStyles.buttonSecondary}
          onClick={() => { setMode('create'); setError(''); }}
        >
          Créer
        </button>
        <button
          type="button"
          className={mode === 'join' ? modalStyles.buttonPrimary : modalStyles.buttonSecondary}
          onClick={() => { setMode('join'); setError(''); }}
        >
          Rejoindre
        </button>
      </div>

      {mode === 'create' ? (
        <>
          <div className={modalStyles.field}>
            <label className={modalStyles.label}>{t('guild.create_name')}</label>
            <input
              className={modalStyles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Mon Serveur"
              autoFocus
              data-testid="create-guild-name"
            />
          </div>

          <button className={modalStyles.buttonPrimary} onClick={handleSubmit} disabled={loading || !name.trim()} data-testid="create-guild-submit">
            {loading ? t('common.loading') : t('guild.create')}
          </button>
        </>
      ) : (
        <>
          <div className={modalStyles.field}>
            <label className={modalStyles.label}>Lien ou code d’invitation</label>
            <input
              className={modalStyles.input}
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="https://opencord.local/invite/abc123 ou abc123"
              autoFocus
              data-testid="join-guild-code"
            />
          </div>

          <button className={modalStyles.buttonPrimary} onClick={handleJoin} disabled={loading || !extractInviteCode(inviteInput)}>
            {loading ? t('common.loading') : 'Rejoindre le serveur'}
          </button>
        </>
      )}
    </Modal>
  );
}

function extractInviteCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withoutQuery = trimmed.split(/[?#]/)[0] || '';
  const match = withoutQuery.match(/(?:^|\/)(?:invite\/)?([A-Za-z0-9_-]{3,})$/);
  return match?.[1] || '';
}
