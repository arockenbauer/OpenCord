import { useState, type MouseEvent } from 'react';
import { Check, MessageCircle, Search, ShieldBan, UserPlus, UserX, Volume2, X } from 'lucide-react';
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

function matchesFriendSearch(relationship: any, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const user = relationship.user;
  const displayName = user.global_name || user.username || '';
  return displayName.toLowerCase().includes(normalized) || (user.username || '').toLowerCase().includes(normalized);
}

function isVoiceChannel(channel: any) {
  return channel?.type === 2 || channel?.type === 13 || channel?.type === 14;
}

function getVoiceActivities(friends: any[], guilds: Map<string, any>, voiceStates: Map<string, any[]>) {
  const friendIds = new Set(friends.map((relationship) => relationship.user.id));
  const activities: Array<{ user: any; guild: any; channel: any }> = [];
  const seen = new Set<string>();

  for (const [guildId, states] of voiceStates) {
    const guild = guilds.get(guildId);
    if (!guild) continue;

    for (const state of states || []) {
      if (!state.channel_id || !friendIds.has(state.user_id) || seen.has(state.user_id)) continue;
      const channel = guild.channels?.find((item: any) => item.id === state.channel_id);
      if (!isVoiceChannel(channel)) continue;
      const relationship = friends.find((item) => item.user.id === state.user_id);
      if (!relationship) continue;
      activities.push({ user: relationship.user, guild, channel });
      seen.add(state.user_id);
    }
  }

  return activities;
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
  const [search, setSearch] = useState('');
  const relationships = useAuthStore((s) => s.relationships);
  const upsertRelationship = useAuthStore((s) => s.upsertRelationship);
  const removeRelationshipByUserId = useAuthStore((s) => s.removeRelationshipByUserId);
  const guilds = useGuildStore((s) => s.guilds);
  const voiceStates = useGuildStore((s) => s.voiceStates);
  const addDMChannel = useGuildStore((s) => s.addDMChannel);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const selectChannel = useGuildStore((s) => s.selectChannel);

  const friends = relationships.filter((r) => r.type === 1);
  const pendingOutgoing = relationships.filter((r) => r.type === 0);
  const pendingIncoming = relationships.filter((r) => r.type === 3);
  const blocked = relationships.filter((r) => r.type === 2);

  const onlineFriends = friends.filter((r) => r.user.status && r.user.status !== 'offline');
  const voiceActivities = getVoiceActivities(friends, guilds, voiceStates);
  const filteredOnlineFriends = onlineFriends.filter((relationship) => matchesFriendSearch(relationship, search));
  const filteredFriends = friends.filter((relationship) => matchesFriendSearch(relationship, search));
  const filteredPendingIncoming = pendingIncoming.filter((relationship) => matchesFriendSearch(relationship, search));
  const filteredPendingOutgoing = pendingOutgoing.filter((relationship) => matchesFriendSearch(relationship, search));
  const filteredBlocked = blocked.filter((relationship) => matchesFriendSearch(relationship, search));

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
    <div className={styles.container} data-testid="friends-page">
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

      <div className={styles.content}>
        <div className={styles.mainPane}>
          {activeTab !== 'add' && (
            <label className={styles.searchBox}>
              <Search size={18} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher" />
            </label>
          )}

          <div className={styles.body}>
            {activeTab === 'add' && <AddFriendPanel />}

            {activeTab === 'online' && (
              <FriendSection
                title={`EN LIGNE — ${filteredOnlineFriends.length}`}
                items={filteredOnlineFriends}
                onOpenDM={handleOpenDM}
                onRemove={handleRemove}
              />
            )}

            {activeTab === 'all' && (
              <FriendSection
                title={`TOUS LES AMIS — ${filteredFriends.length}`}
                items={filteredFriends}
                onOpenDM={handleOpenDM}
                onRemove={handleRemove}
              />
            )}

            {activeTab === 'pending' && (
              <div>
                {filteredPendingIncoming.length > 0 && (
                  <FriendSection
                    title={`EN ATTENTE — REÇUES (${filteredPendingIncoming.length})`}
                    items={filteredPendingIncoming}
                    onAccept={handleAccept}
                    onRemove={handleRemove}
                    isPending
                    isIncoming
                  />
                )}
                {filteredPendingOutgoing.length > 0 && (
                  <FriendSection
                    title={`EN ATTENTE — ENVOYÉES (${filteredPendingOutgoing.length})`}
                    items={filteredPendingOutgoing}
                    onRemove={handleRemove}
                    isPending
                  />
                )}
                {filteredPendingIncoming.length === 0 && filteredPendingOutgoing.length === 0 && (
                  <EmptyState message="Aucune demande en attente." />
                )}
              </div>
            )}

            {activeTab === 'blocked' && (
              <div>
                {filteredBlocked.length > 0 ? (
                  <>
                    <div className={styles.sectionTitle}>BLOQUÉS — {filteredBlocked.length}</div>
                    {filteredBlocked.map((r) => (
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
        <VoiceActivityPanel activities={voiceActivities} />
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
        <div key={r.user.id} className={styles.friendRow} data-testid={`friend-row-${r.user.id}`}>
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
              <button className={styles.actionBtn} onClick={() => onOpenDM(r.user.id)} title="Envoyer un message" data-testid={`friend-message-${r.user.id}`}>
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

function VoiceActivityPanel({ activities }: { activities: Array<{ user: any; guild: any; channel: any }> }) {
  return (
    <aside className={styles.activityPane}>
      <h2 className={styles.activityTitle}>En ligne</h2>
      <div className={styles.activityList}>
        {activities.map(({ user, guild, channel }) => (
          <div key={`${user.id}-${guild.id}-${channel.id}`} className={styles.activityCard}>
            <div className={styles.activityUserRow}>
              <div className={styles.avatarWrap}>
                <UserAvatar user={user} size={40} />
                <span className={`${styles.statusDot} ${getStatusClass(user.status || 'online', styles)}`} />
              </div>
              <div className={styles.friendInfo}>
                <div className={styles.friendName}>{user.global_name || user.username}</div>
                <div className={styles.friendMeta}>{guild.name}</div>
              </div>
            </div>
            <div className={styles.voiceRow}>
              <span className={styles.voiceIcon}><Volume2 size={16} /></span>
              <span className={styles.voiceName}>{channel.name}</span>
            </div>
          </div>
        ))}
      </div>
    </aside>
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
