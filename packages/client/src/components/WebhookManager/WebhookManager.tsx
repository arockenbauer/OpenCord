import { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Link2, X } from 'lucide-react';
import { api } from '../../services/api';
import styles from './WebhookManager.module.css';

interface Webhook {
  id: string;
  name: string;
  channel_id: string;
  token: string;
  creator?: { username: string };
  channel?: { name: string };
}

interface WebhookManagerProps {
  guildId: string;
  channels: any[];
  canManage?: boolean;
}

export function WebhookManager({ guildId, channels, canManage = true }: WebhookManagerProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchWebhooks();
  }, [guildId]);

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const data = await api<any>(`/api/guilds/${guildId}/webhooks`);
      setWebhooks(data.webhooks || []);
    } catch (err) {
      console.error('Failed to fetch webhooks:', err);
    } finally {
      setLoading(false);
    }
  };

  const createWebhook = async () => {
    if (!newName.trim() || !selectedChannelId) return;
    try {
      const wh = await api<any>(`/api/channels/${selectedChannelId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      setWebhooks(prev => [...prev, wh]);
      setNewName('');
      setSelectedChannelId('');
      setShowCreate(false);
    } catch (err) {
      console.error('Failed to create webhook:', err);
    }
  };

  const deleteWebhook = async (webhookId: string) => {
    if (!confirm('Supprimer ce webhook ?')) return;
    try {
      await api(`/api/webhooks/${webhookId}`, { method: 'DELETE' });
      setWebhooks(prev => prev.filter(wh => wh.id !== webhookId));
    } catch (err) {
      console.error('Failed to delete webhook:', err);
    }
  };

  const copyWebhookUrl = (webhook: Webhook) => {
    const url = `${window.location.origin}/api/webhooks/${webhook.id}/${webhook.token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(webhook.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) return <div className={styles.loading}>Chargement...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Webhooks</div>
          <div className={styles.subtitle}>Les webhooks permettent aux applications externes d'envoyer des messages dans vos salons.</div>
        </div>
        {canManage && (
          <button className={styles.addBtn} onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Créer un webhook
          </button>
        )}
      </div>

      {webhooks.length === 0 && !showCreate && (
        <div className={styles.empty}>Aucun webhook configuré.</div>
      )}

      {webhooks.map(wh => (
        <div key={wh.id} className={styles.webhookCard}>
          <div className={styles.webhookInfo}>
            <div className={styles.webhookName}>{wh.name}</div>
            <div className={styles.webhookMeta}>
              #{wh.channel?.name || channels.find(ch => ch.id === wh.channel_id)?.name || 'salon inconnu'}
              {wh.creator && <span> • Créé par {wh.creator.username}</span>}
            </div>
          </div>
          <div className={styles.webhookActions}>
            <button
              className={styles.copyBtn}
              onClick={() => copyWebhookUrl(wh)}
              title="Copier l'URL du webhook"
            >
              {copiedId === wh.id ? 'Copié !' : <><Copy size={14} /> Copier l'URL</>}
            </button>
            {canManage && (
              <button className={styles.deleteBtn} onClick={() => deleteWebhook(wh.id)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      ))}

      {showCreate && canManage && (
        <div className={styles.createForm}>
          <div className={styles.field}>
            <label>Nom du webhook</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nom du webhook"
              maxLength={80}
            />
          </div>
          <div className={styles.field}>
            <label>Salon de destination</label>
            <select value={selectedChannelId} onChange={e => setSelectedChannelId(e.target.value)}>
              <option value="">Sélectionner un salon</option>
              {channels
                .filter(ch => ch.type === 0 || ch.type === 5)
                .map(ch => (
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
            </select>
          </div>
          <div className={styles.formActions}>
            <button className={styles.saveBtn} onClick={createWebhook} disabled={!newName.trim() || !selectedChannelId}>
              Créer
            </button>
            <button className={styles.cancelBtn} onClick={() => { setShowCreate(false); setNewName(''); setSelectedChannelId(''); }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
