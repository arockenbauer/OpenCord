import { useState, useEffect } from 'react';
import { Plus, Trash2, Github, Twitter, Twitch, Youtube, Link } from 'lucide-react';
import { api } from '../../services/api';
import styles from './ConnectedAccounts.module.css';

interface ConnectedAccount {
  id: string;
  platform: string;
  platform_user_id: string;
  platform_username?: string;
  created_at: string;
}

const platformIcons: Record<string, any> = {
  github: Github,
  twitter: Twitter,
  twitch: Twitch,
  youtube: Youtube,
  spotify: Link,
  reddit: Link,
  steam: Link,
  xbox: Link,
  playstation: Link,
  battlenet: Link,
};

const platformLabels: Record<string, string> = {
  github: 'GitHub',
  twitter: 'Twitter',
  twitch: 'Twitch',
  youtube: 'YouTube',
  spotify: 'Spotify',
  reddit: 'Reddit',
  steam: 'Steam',
  xbox: 'Xbox',
  playstation: 'PlayStation',
  battlenet: 'Battle.net',
};

export function ConnectedAccounts({ userId, isSelf }: { userId?: string; isSelf?: boolean }) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [platform, setPlatform] = useState('');
  const [platformUserId, setPlatformUserId] = useState('');
  const [platformUsername, setPlatformUsername] = useState('');

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await api.connected_accounts.get<any>(userId);
      setAccounts(res.accounts || []);
    } catch (err) {
      console.error('Failed to load connected accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, [userId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!platform || !platformUserId) return;
    try {
      await api.connected_accounts.add({
        platform,
        platform_user_id: platformUserId,
        platform_username: platformUsername || undefined,
      });
      setShowAdd(false);
      setPlatform('');
      setPlatformUserId('');
      setPlatformUsername('');
      loadAccounts();
    } catch (err) {
      console.error('Failed to add account:', err);
    }
  };

  const handleRemove = async (accountId: string) => {
    if (!confirm('Supprimer cette connexion ?')) return;
    try {
      await api.connected_accounts.remove(accountId);
      loadAccounts();
    } catch (err) {
      console.error('Failed to remove account:', err);
    }
  };

  if (loading) return <div className={styles.loading}>Chargement...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Comptes connectés</h3>
        {isSelf && (
          <button className={styles.addBtn} onClick={() => setShowAdd(!showAdd)}>
            <Plus size={16} /> Ajouter
          </button>
        )}
      </div>

      {accounts.length === 0 && !showAdd && (
        <div className={styles.empty}>Aucun compte connecté.</div>
      )}

      <div className={styles.accountList}>
        {accounts.map((account) => {
          const Icon = platformIcons[account.platform] || Link;
          const label = platformLabels[account.platform] || account.platform;
          return (
            <div key={account.id} className={styles.accountItem}>
              <div className={styles.accountIcon}>
                <Icon size={20} />
              </div>
              <div className={styles.accountInfo}>
                <div className={styles.accountPlatform}>{label}</div>
                <div className={styles.accountUsername}>
                  {account.platform_username || account.platform_user_id}
                </div>
              </div>
              {isSelf && (
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemove(account.id)}
                  title="Supprimer"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showAdd && isSelf && (
        <form className={styles.addForm} onSubmit={handleAdd}>
          <select
            className={styles.select}
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            required
          >
            <option value="">-- Choisir une plateforme --</option>
            {Object.entries(platformLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            type="text"
            className={styles.input}
            placeholder="ID utilisateur sur la plateforme"
            value={platformUserId}
            onChange={(e) => setPlatformUserId(e.target.value)}
            required
          />
          <input
            type="text"
            className={styles.input}
            placeholder="Nom d'utilisateur (optionnel)"
            value={platformUsername}
            onChange={(e) => setPlatformUsername(e.target.value)}
          />
          <div className={styles.formActions}>
            <button type="submit" className={styles.saveBtn}>Ajouter</button>
            <button type="button" className={styles.cancelBtn} onClick={() => setShowAdd(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
