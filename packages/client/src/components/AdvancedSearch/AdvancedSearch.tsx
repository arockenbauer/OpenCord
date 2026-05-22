import { useState, useEffect } from 'react';
import { Search, X, Calendar, User, Hash, Paperclip, Image, Link, Pin } from 'lucide-react';
import { api } from '../../services/api';
import styles from './AdvancedSearch.module.css';

interface AdvancedSearchProps {
  guildId?: string;
  channelId: string;
  onClose: () => void;
  onResults: (results: any[], summary: string) => void;
  channels: any[];
  members: any[];
}

type HasType = '' | 'link' | 'embed' | 'file' | 'video' | 'image' | 'sticker';

export function AdvancedSearch({ guildId, channelId, onClose, onResults, channels, members }: AdvancedSearchProps) {
  const [query, setQuery] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [channelFilter, setChannelFilter] = useState(guildId ? '' : channelId);
  const [hasType, setHasType] = useState<HasType>('');
  const [pinned, setPinned] = useState('');
  const [dateDuring, setDateDuring] = useState('');
  const [dateBefore, setDateBefore] = useState('');
  const [dateAfter, setDateAfter] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() && !authorId && !channelFilter && !hasType && !pinned && !dateDuring && !dateBefore && !dateAfter) {
      onResults([], '');
      return;
    }

    setLoading(true);
    const params: Record<string, string> = {
      limit: '25',
      offset: '0',
    };

    if (query.trim()) params.q = query.trim();
    if (authorId) params.from = authorId;
    if (channelFilter) params.in = channelFilter;
    if (hasType) params.has = hasType;
    if (pinned) params.pinned = pinned;
    if (dateDuring) params.during = dateDuring;
    if (dateBefore) params.before = dateBefore;
    if (dateAfter) params.after = dateAfter;

    try {
      if (guildId) {
        // Recherche dans tout le serveur (on utilise le premier salon comme base, le backend parcourt les salons)
        const searchableChannels = channels.filter((ch: any) => ch.type === 0 || ch.type === 5 || ch.type === 11);
        const responses = await Promise.all(searchableChannels.map(async (ch: any) => {
          try {
            const data = await api.channels.searchMessages<{ messages: any[]; total_results: number }>(ch.id, params);
            return { channel: ch, messages: data.messages || [], total: data.total_results || 0 };
          } catch {
            return { channel: ch, messages: [], total: 0 };
          }
        }));
        const total = responses.reduce((sum, r) => sum + r.total, 0);
        const merged = responses
          .flatMap(r => r.messages.map((m: any) => ({ ...m, _channelName: r.channel.name })))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        onResults(merged, `${total} résultat${total > 1 ? 's' : ''} dans le serveur`);
      } else {
        const data = await api.channels.searchMessages<{ messages: any[]; total_results: number }>(channelId, params);
        onResults(
          (data.messages || []).map((m: any) => ({ ...m, _channelName: '' })),
          `${data.total_results || 0} résultat${(data.total_results || 0) > 1 ? 's' : ''} dans cette conversation`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearFilters = () => {
    setQuery('');
    setAuthorId('');
    setChannelFilter(guildId ? '' : channelId);
    setHasType('');
    setPinned('');
    setDateDuring('');
    setDateBefore('');
    setDateAfter('');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Recherche avancée</h3>
        <button className={styles.closeButton} onClick={onClose}><X size={18} /></button>
      </div>

      <div className={styles.body}>
        <div className={styles.field}>
          <label>Mots-clés</label>
          <div className={styles.inputWithIcon}>
            <Search size={16} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Rechercher des messages..."
            />
          </div>
        </div>

        {guildId && (
          <div className={styles.field}>
            <label>Auteur</label>
            <select value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
              <option value="">Tous les membres</option>
              {members.map((m: any) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.nickname || m.user.global_name || m.user.username}
                </option>
              ))}
            </select>
          </div>
        )}

        {guildId && (
          <div className={styles.field}>
            <label>Salon</label>
            <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
              <option value="">Tous les salons</option>
              {channels.filter((ch: any) => ch.type === 0 || ch.type === 5 || ch.type === 11).map((ch: any) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.field}>
          <label>Type de message</label>
          <div className={styles.hasButtons}>
            {(['', 'link', 'embed', 'file', 'image', 'video'] as HasType[]).map(type => (
              <button
                key={type || 'all'}
                className={`${styles.hasBtn} ${hasType === type ? styles.hasBtnActive : ''}`}
                onClick={() => setHasType(type)}
              >
                {type === '' && 'Tous'}
                {type === 'link' && <><Link size={14} /> Lien</>}
                {type === 'embed' && 'Embed'}
                {type === 'file' && <><Paperclip size={14} /> Fichier</>}
                {type === 'image' && <><Image size={14} /> Image</>}
                {type === 'video' && 'Vidéo'}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Épinglés</label>
          <div className={styles.hasButtons}>
            {(['', 'true', 'false'] as const).map(val => (
              <button
                key={val || 'all'}
                className={`${styles.hasBtn} ${pinned === val ? styles.hasBtnActive : ''}`}
                onClick={() => setPinned(val)}
              >
                {val === '' ? 'Tous' : val === 'true' ? <><Pin size={14} /> Oui</> : 'Non'}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Période (YYYY-MM)</label>
          <div className={styles.inputWithIcon}>
            <Calendar size={16} />
            <input
              type="month"
              value={dateDuring}
              onChange={(e) => setDateDuring(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.clearBtn} onClick={clearFilters}>Effacer les filtres</button>
          <button className={styles.searchBtn} onClick={handleSearch} disabled={loading}>
            <Search size={16} />
            {loading ? 'Recherche...' : 'Rechercher'}
          </button>
        </div>
      </div>
    </div>
  );
}
