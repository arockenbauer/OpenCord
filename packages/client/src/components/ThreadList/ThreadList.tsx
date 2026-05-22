import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Hash, MessageSquare, Archive, Plus, X, Users } from 'lucide-react';
import { api } from '../../services/api';
import styles from './ThreadList.module.css';

export function ThreadList({ channelId, onSelectThread, onClose }: {
  channelId: string;
  onSelectThread: (thread: any) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [activeThreads, setActiveThreads] = useState<any[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    fetchThreads();
  }, [channelId]);

  const fetchThreads = async () => {
    try {
      setLoading(true);
      const [activeData, archivedData] = await Promise.all([
        api<any>(`/api/channels/${channelId}/threads/active`),
        api<any>(`/api/channels/${channelId}/threads/archived/public`),
      ]);
      setActiveThreads(activeData.threads || []);
      setArchivedThreads(archivedData.threads || []);
    } catch (err) {
      console.error('Failed to fetch threads:', err);
    } finally {
      setLoading(false);
    }
  };

  const createThread = async () => {
    const name = prompt('Nom du fil de discussion:');
    if (!name) return;
    try {
      const thread = await api<any>(`/api/channels/${channelId}/threads`, {
        method: 'POST',
        body: JSON.stringify({ name, private: false }),
      });
      setActiveThreads(prev => [...prev, thread]);
      onSelectThread(thread);
    } catch (err) {
      console.error('Failed to create thread:', err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Fils de discussion</h3>
        <div className={styles.headerActions}>
          <button className={styles.createButton} onClick={createThread}>
            <Plus size={16} />
          </button>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Chargement...</div>
      ) : (
        <>
          <div className={styles.section}>
            <h4>Fils actifs ({activeThreads.length})</h4>
            {activeThreads.length === 0 ? (
              <div className={styles.empty}>Aucun fil actif</div>
            ) : (
              activeThreads.map(thread => (
                <div
                  key={thread.id}
                  className={styles.threadItem}
                  onClick={() => onSelectThread(thread)}
                >
                  <Hash size={16} />
                  <div className={styles.threadInfo}>
                    <div className={styles.threadName}>{thread.name}</div>
                    <div className={styles.threadMeta}>
                      <MessageSquare size={12} /> {thread.total_messages || 0} messages
                      <Users size={12} /> {thread.member_count || 0} membres
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className={styles.section}>
            <h4>
              <button
                className={styles.toggleButton}
                onClick={() => setShowArchived(!showArchived)}
              >
                <Archive size={16} />
                Fils archivés ({archivedThreads.length})
                {showArchived ? '▲' : '▼'}
              </button>
            </h4>
            {showArchived && (
              archivedThreads.length === 0 ? (
                <div className={styles.empty}>Aucun fil archivé</div>
              ) : (
                archivedThreads.map(thread => (
                  <div
                    key={thread.id}
                    className={styles.threadItem}
                    onClick={() => onSelectThread(thread)}
                  >
                    <Archive size={16} />
                    <div className={styles.threadInfo}>
                      <div className={styles.threadName}>{thread.name}</div>
                      <div className={styles.threadMeta}>
                        <MessageSquare size={12} /> {thread.total_messages || 0} messages
                      </div>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
