import { useEffect, useState } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { api } from '../../services/api';
import styles from './ChatArea.module.css';

interface ThreadsPanelProps {
  channelId: string | null;
  guild: any;
  onSelectThread: (threadId: string) => void;
}

export function ThreadsPanel({ channelId, guild, onSelectThread }: ThreadsPanelProps) {
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedChannelId = useGuildStore((s) => s.selectedChannelId);

  useEffect(() => {
    if (!channelId || !guild) return;
    setLoading(true);
    api(`/api/channels/${channelId}/threads`)
      .then((data: any) => {
        setThreads(data.threads || []);
      })
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }, [channelId, guild]);

  const handleCreateThread = () => {
    const name = window.prompt('Nom du fil', 'Nouveau fil');
    if (!name?.trim() || !channelId) return;
    api<any>(`/api/channels/${channelId}/threads`, {
      method: 'POST',
      body: JSON.stringify({ name: name.trim() }),
    }).then((thread) => {
      if (guild) {
        useGuildStore.getState().addChannel(guild.id, thread);
      }
      onSelectThread(thread.id);
    });
  };

  if (loading) return <div className={styles.sidePanelEmpty}>Chargement…</div>;

  return (
    <div>
      <div className={styles.threadsPanelHeader}>
        <button className={styles.headerPillButton} onClick={handleCreateThread}>
          <Plus size={14} /> Nouveau fil
        </button>
      </div>
      {threads.length === 0 ? (
        <div className={styles.sidePanelEmpty}>Aucun fil actif dans ce salon.</div>
      ) : (
        threads.map((thread) => (
          <button
            key={thread.id}
            className={`${styles.threadCard} ${selectedChannelId === thread.id ? styles.threadCardActive : ''}`}
            onClick={() => onSelectThread(thread.id)}
          >
            <MessageCircle size={16} />
            <div className={styles.threadCardContent}>
              <div className={styles.threadCardName}>{thread.name}</div>
              <div className={styles.threadCardMeta}>
                {thread.message_count || 0} messages • {thread.member_count || 0} membres
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
