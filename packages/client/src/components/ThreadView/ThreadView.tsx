import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Hash, Archive, Users, Plus, X, MessageSquare, Settings } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useMessageStore } from '../../stores/messageStore';
import { api } from '../../services/api';
import styles from './ThreadView.module.css';

export function ThreadView({ thread, onClose }: { thread: any; onClose: () => void }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [threadInfo, setThreadInfo] = useState<any>(thread);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentUser = useGuildStore((s) => s.getSelectedGuild()?.members?.find((m: any) => m.user.id === threadInfo?.user_id))?.user;

  useEffect(() => {
    fetchMessages();
    fetchThreadInfo();
  }, [thread.id]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const data = await api<any>(`/api/channels/${thread.id}/messages`);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to fetch thread messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchThreadInfo = async () => {
    try {
      const data = await api<any>(`/api/channels/${thread.id}`);
      setThreadInfo(data);
    } catch (err) {
      console.error('Failed to fetch thread info:', err);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim()) return;
    try {
      await api(`/api/channels/${thread.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: inputValue }),
      });
      setInputValue('');
      fetchMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const archiveThread = async () => {
    try {
      await api(`/api/channels/${thread.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true }),
      });
      onClose();
    } catch (err) {
      console.error('Failed to archive thread:', err);
    }
  };

  const joinThread = async () => {
    try {
      await api(`/api/channels/${thread.id}/thread-members/@me`, {
        method: 'PUT',
      });
      fetchThreadInfo();
    } catch (err) {
      console.error('Failed to join thread:', err);
    }
  };

  const leaveThread = async () => {
    try {
      await api(`/api/channels/${thread.id}/thread-members/@me`, {
        method: 'DELETE',
      });
      fetchThreadInfo();
    } catch (err) {
      console.error('Failed to leave thread:', err);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isMember = threadInfo.thread_members?.some((m: any) => m.user_id === currentUser?.id);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Hash size={20} />
          <span className={styles.threadName}>{threadInfo.name}</span>
          {threadInfo.thread_metadata?.archived && (
            <span className={styles.archivedBadge}>Archivé</span>
          )}
        </div>
        <div className={styles.headerRight}>
          <span className={styles.memberCount}>
            <Users size={16} /> {threadInfo.member_count || 0}
          </span>
          {isMember ? (
            <button className={styles.actionButton} onClick={leaveThread}>
              Quitter
            </button>
          ) : (
            <button className={styles.actionButton} onClick={joinThread}>
              Rejoindre
            </button>
          )}
          {!threadInfo.thread_metadata?.archived && (
            <button className={styles.actionButton} onClick={archiveThread}>
              <Archive size={16} /> Archiver
            </button>
          )}
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div className={styles.messagesContainer}>
        {loading ? (
          <div className={styles.loading}>Chargement...</div>
        ) : messages.length === 0 ? (
          <div className={styles.empty}>Aucun message dans ce fil.</div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={styles.message}>
              <div className={styles.messageAvatar}>
                {msg.author?.avatar ? (
                  <img src={msg.author.avatar} alt="" />
                ) : (
                  <div className={styles.defaultAvatar}>
                    {msg.author?.username?.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className={styles.messageContent}>
                <div className={styles.messageHeader}>
                  <span className={styles.messageAuthor}>
                    {msg.author?.global_name || msg.author?.username}
                  </span>
                  <span className={styles.messageTime}>
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className={styles.messageBody}>{msg.content}</div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <input
          type="text"
          className={styles.messageInput}
          placeholder="Envoyer un message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button className={styles.sendButton} onClick={sendMessage}>
          <MessageSquare size={20} />
        </button>
      </div>
    </div>
  );
}
