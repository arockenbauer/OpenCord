import { useState, type MouseEvent } from 'react';
import { UserPlus, MessageCircle, UserX, ShieldBan, Check, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useUIStore } from '../../stores/uiStore';
import type { DMChannel } from '../../stores/guildStore';
import { api } from '../../services/api';
import styles from './FriendsView.module.css';

type FriendsTab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

function getStatusClass(status: string, css: Record<string, string>) {
  if (status === 'online') return css.statusOnline;
  if (status === 'idle') return css.statusIdle;
  if (status === 'dnd') return css.statusDnd;
  return css.statusOffline;
}

function UserAvatar({ user, size = 40 }: { user: any; size?: number }) {
  const setProfilePopover = useUIStore((s) => s.setProfilePopover);

  const openProfile = (event: MouseEvent<HTMLButtonElement>) => {
    if (!user.id) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setProfilePopover({ userId: user.id, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };

  return (
    <button className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.4 }} onClick={openProfile} data-user-popout-trigger="true">
      {user.avatar ? <img src={user.avatar} alt="" /> : (user.global_name || user.username).slice(0, 1).toUpperCase()}
    </button>
  );
}

export function FriendsView() {
  const [activeTab, setActiveTab] = useState<FriendsTab>('online');
  const relationships = useAuthStore((s) => s.relationships);
  const upsertRelationship = useAuthStore((s) => s.upsertRelationship);
  const removeRelationshipByUserId = useAuthStore((s) => s.removeRelationshipByUserId);
  const addDMChannel = useGuildStore((s) => s.addDMChannel);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const selectChannel = useGuildStore((s) => s.selectChannel);

  const friends = relationships.filter((r) => r.type === 1);
  const pendingOutgoing = relationships.filter((r) => r.type === 0);
  const pendingIncoming = relationships.filter((r) => r.type === 3);
  const blocked = relationships.filter((r) => r.type === 2);

  const onlineFriends = friends.filter((r) => r.user.status && r.user.status !== 'offline');

  const handleOpenDM = async (userId: string) => {
    try {
      const channel = await api.users.createDM<DMChannel>(userId);
      addDMChannel(channel);
      selectGuild(null);
      selectChannel(channel.id);
    } catch (err: any) {
      console.error('Failed to open DM:', err.message);
    }
  };

  const handleAccept = async (userId: string) => {
    try {
      const rel = relationships.find((r) => r.user.id === userId);
      if (!rel) return;
      const result = await api.friends.accept<{ id: string; type: number; user?: any }>(rel.user.id);
      upsertRelationship({ id: result.id, type: 1, user: result.user || rel.user });
    } catch { /* ignore */ }
  };

  const handleRemove = async (userId: string) => {
    try {
      await api.friends.remove(userId);
      removeRelationshipByUserId(userId);
    } catch { /* ignore */ }
  };

  const handleUnblock = async (userId: string) => {
    try {
      await api.friends.remove(userId);
      removeRelationshipByUserId(userId);
    } catch { /* ignore */ }
  };

  const tabs: { id: FriendsTab; label: string; count?: number }[] = [
    { id: 'online', label: 'En ligne', count: onlineFriends.length },
    { id: 'all', label: 'Tous', count: friends.length },
    { id: 'pending', label: 'En attente', count: pendingIncoming.length + pendingOutgoing.length },
    { id: 'blocked', label: 'Bloqués', count: blocked.length },
    { id: 'add', label: 'Ajouter un ami' },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <UserPlus size={20} />
        </div>
        <div className={styles.headerTitle}>Amis</div>
        <div className={styles.tabs}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''} ${tab.id === 'add' ? styles.tabAdd : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && <span className={styles.badge}>{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.body}>
        {activeTab === 'add' && <AddFriendPanel />}

        {activeTab === 'online' && (
          <FriendSection
            title={`EN LIGNE — ${onlineFriends.length}`}
            items={onlineFriends}
            onOpenDM={handleOpenDM}
            onRemove={handleRemove}
          />
        )}

        {activeTab === 'all' && (
          <FriendSection
            title={`TOUS LES AMIS — ${friends.length}`}
            items={friends}
            onOpenDM={handleOpenDM}
            onRemove={handleRemove}
          />
        )}

        {activeTab === 'pending' && (
          <div>
            {pendingIncoming.length > 0 && (
              <FriendSection
                title={`EN ATTENTE — REÇUES (${pendingIncoming.length})`}
                items={pendingIncoming}
                onAccept={handleAccept}
                onRemove={handleRemove}
                isPending
                isIncoming
              />
            )}
            {pendingOutgoing.length > 0 && (
              <FriendSection
                title={`EN ATTENTE — ENVOYÉES (${pendingOutgoing.length})`}
                items={pendingOutgoing}
                onRemove={handleRemove}
                isPending
              />
            )}
            {pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
              <EmptyState message="Aucune demande en attente." />
            )}
          </div>
        )}

        {activeTab === 'blocked' && (
          <div>
            {blocked.length > 0 ? (
              <>
                <div className={styles.sectionTitle}>BLOQUÉS — {blocked.length}</div>
                {blocked.map((r) => (
                  <div key={r.user.id} className={styles.friendRow}>
                    <div className={styles.avatarWrap}>
                      <UserAvatar user={r.user} />
                    </div>
                    <div className={styles.friendInfo}>
                      <div className={styles.friendName}>{r.user.global_name || r.user.username}</div>
                      <div className={styles.friendMeta}>Bloqué</div>
                    </div>
                    <div className={styles.friendActions}>
                      <button className={styles.actionBtn} onClick={() => handleUnblock(r.user.id)} title="Débloquer">
                        <ShieldBan size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <EmptyState message="Tu n'as bloqué personne." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FriendSection({
  title, items, onOpenDM, onRemove, onAccept, isPending, isIncoming,
}: {
  title: string;
  items: any[];
  onOpenDM?: (userId: string) => void;
  onRemove: (userId: string) => void;
  onAccept?: (userId: string) => void;
  isPending?: boolean;
  isIncoming?: boolean;
}) {
  if (items.length === 0 && !isPending) return <EmptyState message="Aucun ami dans cette catégorie." />;

  return (
    <div>
      <div className={styles.sectionTitle}>{title}</div>
      {items.map((r) => (
        <div key={r.user.id} className={styles.friendRow}>
          <div className={styles.avatarWrap}>
            <UserAvatar user={r.user} />
            {!isPending && (
              <span className={`${styles.statusDot} ${getStatusClass(r.user.status || 'offline', styles)}`} />
            )}
          </div>
          <div className={styles.friendInfo}>
            <div className={styles.friendName}>{r.user.global_name || r.user.username}</div>
            <div className={styles.friendMeta}>
              {isPending ? (isIncoming ? 'Demande reçue' : 'Demande envoyée') : getStatusLabel(r.user.status, r.user.custom_status_text)}
            </div>
          </div>
          <div className={styles.friendActions}>
            {isIncoming && onAccept && (
              <button className={`${styles.actionBtn} ${styles.actionBtnAccept}`} onClick={() => onAccept(r.user.id)} title="Accepter">
                <Check size={18} />
              </button>
            )}
            {onOpenDM && !isPending && (
              <button className={styles.actionBtn} onClick={() => onOpenDM(r.user.id)} title="Envoyer un message">
                <MessageCircle size={18} />
              </button>
            )}
            <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => onRemove(r.user.id)} title={isPending ? 'Annuler' : 'Retirer'}>
              {isPending ? <X size={18} /> : <UserX size={18} />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AddFriendPanel() {
  const upsertRelationship = useAuthStore((s) => s.upsertRelationship);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const parts = input.trim().split('#');
    const username = parts[0];
    const discriminator = parts[1] || '0000';
    if (!username) return;
    setLoading(true);
    setMsg('');
    setSuccess(false);
    try {
      const relationship = await api.post<{ id: string; type: number; user?: any }>('/relationships', { username, discriminator });
      if (relationship.user) upsertRelationship(relationship as any);
      setSuccess(true);
      setMsg(`Demande envoyée à ${username} !`);
      setInput('');
    } catch (e: any) {
      setMsg(e.message || 'Erreur lors de l\'envoi de la demande.');
    }
    setLoading(false);
  };

  return (
    <div className={styles.addPanel}>
      <div className={styles.addTitle}>Ajouter un ami</div>
      <div className={styles.addDesc}>Tu peux ajouter quelqu'un avec son nom d'utilisateur et son identifiant.</div>
      <div className={styles.addRow}>
        <input
          className={styles.addInput}
          placeholder="NomUtilisateur#0000"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className={styles.addBtn} onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? 'Envoi…' : 'Envoyer une demande'}
        </button>
      </div>
      {msg && (
        <div className={`${styles.addMsg} ${success ? styles.addMsgSuccess : styles.addMsgError}`}>
          {msg}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className={styles.empty}>{message}</div>;
}

function getStatusLabel(status: string, customStatus?: string | null) {
  if (customStatus) return customStatus;
  if (status === 'online') return 'En ligne';
  if (status === 'idle') return 'Inactif';
  if (status === 'dnd') return 'Ne pas déranger';
  return 'Hors ligne';
}
