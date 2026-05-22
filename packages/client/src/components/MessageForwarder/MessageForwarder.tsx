import { useState, useEffect } from 'react';
import { X, Send, Search } from 'lucide-react';
import { api } from '../../services/api';
import styles from './MessageForwarder.module.css';

interface MessageForwarderProps {
  message: any;
  onClose: () => void;
  onForwarded: () => void;
}

export function MessageForwarder({ message, onClose, onForwarded }: MessageForwarderProps) {
  const [guilds, setGuilds] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string>('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchGuilds();
  }, []);

  useEffect(() => {
    if (selectedGuildId) {
      fetchChannels(selectedGuildId);
    } else {
      setChannels([]);
    }
  }, [selectedGuildId]);

  const fetchGuilds = async () => {
    try {
      const data = await api<any>('/api/users/@me/guilds');
      setGuilds(data || []);
    } catch (err) {
      console.error('Failed to fetch guilds:', err);
    }
  };

  const fetchChannels = async (guildId: string) => {
    try {
      const data = await api<any>(`/api/guilds/${guildId}/channels`);
      // Filtrer seulement les salons textuels (type 0, 5 pour les forums)
      const textChannels = (data || []).filter((ch: any) => ch.type === 0 || ch.type === 5);
      setChannels(textChannels);
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    }
  };

  const handleForward = async () => {
    if (!selectedChannelId) return;
    try {
      setLoading(true);
      await api(`/api/channels/${selectedChannelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: `Transféré de <#${message.channel_id}>\n\n${message.content || ''}`,
          forwarded_from: message.id,
          forwarded_channel_id: message.channel_id,
        }),
      });
      onForwarded();
      onClose();
    } catch (err) {
      console.error('Failed to forward message:', err);
      alert('Erreur lors du transfert du message');
    } finally {
      setLoading(false);
    }
  };

  const filteredGuilds = guilds.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredChannels = channels.filter(ch =>
    ch.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>Transférer le message</h3>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Rechercher un serveur ou un salon..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {!selectedGuildId ? (
            <div className={styles.list}>
              <div className={styles.sectionTitle}>Serveurs</div>
              {filteredGuilds.map(guild => (
                <button
                  key={guild.id}
                  className={styles.item}
                  onClick={() => setSelectedGuildId(guild.id)}
                >
                  {guild.icon ? (
                    <img src={guild.icon} alt="" className={styles.guildIcon} />
                  ) : (
                    <div className={styles.guildIconFallback}>
                      {guild.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span>{guild.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.list}>
              <button
                className={styles.backButton}
                onClick={() => {
                  setSelectedGuildId('');
                  setSelectedChannelId('');
                }}
              >
                ← Retour aux serveurs
              </button>
              <div className={styles.sectionTitle}>Salons textuels</div>
              {filteredChannels.map(channel => (
                <button
                  key={channel.id}
                  className={`${styles.item} ${selectedChannelId === channel.id ? styles.selected : ''}`}
                  onClick={() => setSelectedChannelId(channel.id)}
                >
                  # {channel.name}
                </button>
              ))}
              {filteredChannels.length === 0 && (
                <div className={styles.empty}>Aucun salon textuel trouvé.</div>
              )}
            </div>
          )}

          <div className={styles.messagePreview}>
            <div className={styles.previewTitle}>Message à transférer :</div>
            <div className={styles.previewContent}>
              {message.content?.slice(0, 200) || '(Message vide)'}
              {message.content?.length > 200 && '...'}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Annuler
          </button>
          <button
            className={styles.forwardButton}
            onClick={handleForward}
            disabled={!selectedChannelId || loading}
          >
            <Send size={16} />
            {loading ? 'Transfert...' : 'Transférer'}
          </button>
        </div>
      </div>
    </div>
  );
}
