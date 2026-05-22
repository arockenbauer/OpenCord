import { useState, useEffect } from 'react';
import { Copy, Check, Trash2, Link, Settings, Hash, Clock, Users } from 'lucide-react';
import { Modal, modalStyles } from '../Modal/Modal';
import { api } from '../../services/api';
import { format } from 'date-fns';

interface Invite {
  code: string;
  guild_id: string;
  channel_id: string;
  channel?: { id: string; name: string; type: number };
  inviter?: { username: string; discriminator: string };
  uses: number;
  max_uses: number;
  max_age: number;
  expires_at?: string | null;
  created_at: string;
}

interface InviteModalProps {
  guildId: string;
  channelId: string;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { label: '30 minutes', value: 1800 },
  { label: '1 heure', value: 3600 },
  { label: '6 heures', value: 21600 },
  { label: '12 heures', value: 43200 },
  { label: '1 jour', value: 86400 },
  { label: '7 jours', value: 604800 },
  { label: 'Jamais', value: 0 },
];

const MAX_USES_OPTIONS = [
  { label: 'Pas de limite', value: 0 },
  { label: '1 utilisation', value: 1 },
  { label: '5 utilisations', value: 5 },
  { label: '10 utilisations', value: 10 },
  { label: '25 utilisations', value: 25 },
  { label: '50 utilisations', value: 50 },
  { label: '100 utilisations', value: 100 },
];

export function InviteModal({ guildId, channelId, onClose }: InviteModalProps) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newInvite, setNewInvite] = useState<Invite | null>(null);
  const [maxAge, setMaxAge] = useState(604800);
  const [maxUses, setMaxUses] = useState(0);
  const [temporary, setTemporary] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadInvites();
  }, [guildId]);

  const loadInvites = async () => {
    setListLoading(true);
    try {
      const data = await api<Invite[]>(`/api/guilds/${guildId}/invites`);
      const loaded = data || [];
      setInvites(loaded);
      const reusable = loaded.find((invite) => invite.channel_id === channelId && invite.max_age === 604800 && invite.max_uses === 0);
      if (reusable) {
        setNewInvite(reusable);
      } else {
        await createInvite({ maxAge: 604800, maxUses: 0, temporary: false, reusable: true });
      }
    } catch { /* handled */ }
    setListLoading(false);
  };

  const createInvite = async (options?: { maxAge?: number; maxUses?: number; temporary?: boolean; reusable?: boolean }) => {
    setLoading(true);
    setError('');
    try {
      const invite = await api<Invite>(`/api/guilds/${guildId}/invites`, {
        method: 'POST',
        body: JSON.stringify({
          channel_id: channelId,
          max_age: options?.maxAge ?? maxAge,
          max_uses: options?.maxUses ?? maxUses,
          temporary: options?.temporary ?? temporary,
          unique: !(options?.reusable ?? false),
        }),
      });
      setNewInvite(invite);
      setInvites((prev) => [invite, ...prev.filter((i) => i.code !== invite.code)]);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création de l\'invitation');
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    await createInvite();
    setShowAdvanced(false);
  };

  const handleDelete = async (code: string) => {
    try {
      await api(`/api/invites/${code}`, { method: 'DELETE' });
      setInvites((prev) => prev.filter((i) => i.code !== code));
      if (newInvite?.code === code) setNewInvite(null);
    } catch { /* handled */ }
  };

  const handleCopy = (code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inviteUrl = newInvite ? `${window.location.origin}/invite/${newInvite.code}` : '';
  const activeInvite = newInvite || invites[0] || null;
  const activeInviteUrl = activeInvite ? `${window.location.origin}/invite/${activeInvite.code}` : inviteUrl;

  return (
    <Modal onClose={onClose}>
      <div className={modalStyles.title} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Link size={20} />
        Inviter des personnes
      </div>

      {error && <div className={modalStyles.error}>{error}</div>}

      <div>
        <div className={modalStyles.subtitle}>Envoyez ce lien à vos amis pour les inviter sur le serveur.</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            readOnly
            value={activeInviteUrl}
            className={modalStyles.input}
            style={{ flex: 1, fontFamily: 'monospace', fontWeight: 600 }}
            aria-label="Lien d'invitation"
          />
          <button
            className={modalStyles.buttonPrimary}
            style={{ width: '108px', flexShrink: 0 }}
            onClick={() => activeInvite && handleCopy(activeInvite.code)}
            disabled={!activeInvite}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>

        {activeInvite && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Hash size={13} /> {activeInvite.channel_id === channelId ? 'Salon actuel' : activeInvite.channel?.name || 'Salon'}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> {activeInvite.expires_at ? `Expire le ${format(new Date(activeInvite.expires_at), 'dd/MM/yyyy HH:mm')}` : 'N’expire jamais'}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={13} /> {activeInvite.uses}/{activeInvite.max_uses || '∞'}</span>
          </div>
        )}

        <button
          className={modalStyles.buttonSecondary}
          onClick={() => setShowAdvanced((value) => !value)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: showAdvanced ? 16 : 0 }}
        >
          <Settings size={16} />
          Modifier le lien d'invitation
        </button>

        {showAdvanced && (
          <div style={{ padding: '12px', borderRadius: 8, background: 'var(--bg-tertiary)', marginBottom: 12 }}>
            <div className={modalStyles.field}>
              <label className={modalStyles.label}>Expire après</label>
              <select
                className={modalStyles.input}
                value={maxAge}
                onChange={(e) => setMaxAge(Number(e.target.value))}
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className={modalStyles.field}>
              <label className={modalStyles.label}>Nombre max d'utilisations</label>
              <select
                className={modalStyles.input}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value))}
              >
                {MAX_USES_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, color: 'var(--text-primary)', fontSize: 14 }}>
              <span>Accorder une adhésion temporaire</span>
              <input type="checkbox" checked={temporary} onChange={(event) => setTemporary(event.target.checked)} />
            </label>

            <button className={modalStyles.buttonPrimary} onClick={handleCreate} disabled={loading}>
              {loading ? 'Création…' : 'Générer un nouveau lien'}
            </button>
          </div>
        )}

        {!activeInvite && !showAdvanced && (
          <button className={modalStyles.buttonPrimary} onClick={handleCreate} disabled={loading}>
            {loading ? 'Création…' : 'Créer une invitation'}
          </button>
        )}
      </div>

      {invites.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div className={modalStyles.label}>Invitations existantes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {listLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Chargement…</div>
            ) : (
              invites.map((invite) => (
                <div
                  key={invite.code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}>{invite.code}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {invite.uses}/{invite.max_uses || '∞'} utilisations
                      {invite.inviter && ` · ${invite.inviter.username}`}
                      {invite.created_at && ` · ${format(new Date(invite.created_at), 'dd/MM/yyyy')}`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(invite.code)}
                    title="Copier"
                    style={{ color: 'var(--text-muted)', padding: '4px', borderRadius: '4px' }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(invite.code)}
                    title="Supprimer"
                    style={{ color: 'var(--text-danger)', padding: '4px', borderRadius: '4px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
