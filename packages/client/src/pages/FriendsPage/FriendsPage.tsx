import { useState, useEffect, useRef, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Search, MessageCircle, UserX, ShieldBan, Check, X, ArrowLeft, FileText, ShieldAlert, Users } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import type { Relationship } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useUIStore } from '../../stores/uiStore';
import type { DMChannel } from '../../stores/guildStore';
import { UserNoteEditor } from '../../components/UserNoteEditor/UserNoteEditor';
import { api } from '../../services/api';
import styles from './FriendsPage.module.css';

type TabId = 'friends' | 'add' | 'pending' | 'blocked';

function getStatusClass(status: string, css: Record<string, string>) {
  if (status === 'online') return css.statusOnline;
  if (status === 'idle') return css.statusIdle;
  if (status === 'dnd') return css.statusDnd;
  return css.statusOffline;
}

function UserAvatar({ user, size = 40 }: { user: { id?: string; avatar: string | null; global_name?: string | null; username: string }; size?: number }) {
  const setProfilePopover = useUIStore((s) => s.setProfilePopover);
  const openProfile = (event: ReactMouseEvent<HTMLButtonElement>) => {
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

function getStatusLabel(status: string, customStatus?: string | null) {
  if (customStatus) return customStatus;
  if (status === 'online') return 'En ligne';
  if (status === 'idle') return 'Inactif';
  if (status === 'dnd') return 'Ne pas déranger';
  return 'Hors ligne';
}

export function FriendsPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const relationships = useAuthStore((s) => s.relationships);
  const upsertRelationship = useAuthStore((s) => s.upsertRelationship);
  const removeRelationshipByUserId = useAuthStore((s) => s.removeRelationshipByUserId);
  const addDMChannel = useGuildStore((s) => s.addDMChannel);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const selectChannel = useGuildStore((s) => s.selectChannel);
  const guilds = useGuildStore((s) => s.guilds);
  const dmChannels = useGuildStore((s) => s.dmChannels);

  const [activeTab, setActiveTab] = useState<TabId>('friends');
  const [search, setSearch] = useState('');
  const [noteTarget, setNoteTarget] = useState<Relationship | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rel: Relationship } | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  const friends = relationships.filter((r) => r.type === 1);
  const pendingOutgoing = relationships.filter((r) => r.type === 0);
  const pendingIncoming = relationships.filter((r) => r.type === 3);
  const blocked = relationships.filter((r) => r.type === 2);

  const fetchNotes = useCallback(async () => {
    // Notes are now handled by UserNoteEditor component
  }, []);

  const onlineFriends = friends.filter((r) => r.user.status && r.user.status !== 'offline');

  const filteredFriends = search
    ? friends.filter((r) =>
        (r.user.global_name || r.user.username).toLowerCase().includes(search.toLowerCase())
      )
    : friends;

  useEffect(() => {
    if (!currentUser || relationships.length === 0) {
      fetchMe().catch(() => undefined);
    }
  }, [currentUser, fetchMe, relationships.length]);

  useEffect(() => {
    // Notes are now handled by UserNoteEditor component
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleOpenDM = async (userId: string) => {
    try {
      const channel = await api.users.createDM<DMChannel>(userId);
      addDMChannel(channel);
      selectGuild(null);
      selectChannel(channel.id);
      navigate('/channels');
    } catch { /* ignore */ }
  };

  const handleAccept = async (userId: string) => {
    try {
      const rel = relationships.find((r) => r.user.id === userId);
      if (!rel) return;
      const result = await api.friends.accept<{ id: string; type: number; user?: any }>(userId);
      upsertRelationship({ id: result.id, type: 1, user: result.user || rel.user });
    } catch { /* ignore */ }
  };

  const handleDecline = async (userId: string) => {
    try {
      await api.friends.reject(userId);
      removeRelationshipByUserId(userId);
    } catch { /* ignore */ }
  };

  const handleRemove = async (userId: string) => {
    try {
      await api.friends.remove(userId);
      removeRelationshipByUserId(userId);
    } catch { /* ignore */ }
  };

  const handleBlock = async (userId: string) => {
    try {
      await api.friends.block(userId);
      const rel = relationships.find((r) => r.user.id === userId);
      if (rel) upsertRelationship({ id: rel.id, type: 2, user: rel.user });
      setContextMenu(null);
    } catch { /* ignore */ }
  };

  const handleUnblock = async (userId: string) => {
    try {
      await api.friends.unblock(userId);
      removeRelationshipByUserId(userId);
    } catch { /* ignore */ }
  };

  const handleOpenNote = (rel: Relationship) => {
    setNoteTarget(rel);
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'friends', label: 'Tous les amis', count: friends.length },
    { id: 'add', label: 'Ajouter un ami' },
    { id: 'pending', label: 'Demandes en attente', count: pendingIncoming.length + pendingOutgoing.length },
    { id: 'blocked', label: 'Bloqués', count: blocked.length },
  ];

  return (
    <div className={styles.container} data-testid="friends-page">
      {/* Left Sidebar - Guild/DM list */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarHeaderIcon}><Users size={20} /></div>
          <div className={styles.sidebarHeaderTitle}>OpenCord</div>
        </div>
        <div className={styles.sidebarContent}>
          {/* DM Channels */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ padding: '8px 12px 4px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              Messages
            </div>
            {dmChannels.map((ch) => {
              const recipient = ch.recipients?.[0];
              if (!recipient) return null;
              return (
                <div
                  key={ch.id}
                  className={styles.guildItem}
                  onClick={() => {
                    selectGuild(null);
                    selectChannel(ch.id);
                    navigate('/channels');
                  }}
                >
                  <div className={styles.guildIcon}>
                    {recipient.avatar ? <img src={recipient.avatar} alt="" /> : (recipient.global_name || recipient.username).slice(0, 1).toUpperCase()}
                  </div>
                  <div className={styles.guildName}>{recipient.global_name || recipient.username}</div>
                </div>
              );
            })}
          </div>
          {/* Guilds */}
          {Array.from(guilds.values()).map((g) => (
            <div
              key={g.id}
              className={styles.guildItem}
              onClick={() => {
                selectGuild(g.id);
                navigate('/channels');
              }}
            >
              <div className={styles.guildIcon}>
                {g.icon ? <img src={g.icon} alt="" /> : g.name.slice(0, 1).toUpperCase()}
              </div>
              <div className={styles.guildName}>{g.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button className={styles.backBtn} onClick={() => navigate('/channels')}>
              <ArrowLeft size={18} />
            </button>
            <div className={styles.headerTitle}>Amis</div>
          </div>
          {activeTab === 'friends' && (
            <div className={styles.searchBar}>
              <Search size={16} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder="Rechercher des amis..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="friends-search"
              />
            </div>
          )}
        </div>

        <div className={styles.body}>
          <div className={styles.tabsContainer}>
            <div className={styles.tabs}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span style={{
                      background: 'var(--danger)',
                      color: 'white',
                      borderRadius: 'var(--radius-full)',
                      padding: '0 5px',
                      fontSize: '11px',
                      fontWeight: 'var(--font-weight-bold)',
                      minWidth: '18px',
                      textAlign: 'center',
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.content}>
            {activeTab === 'add' && (
              <AddFriendPanel />
            )}

            {activeTab === 'friends' && (
              <>
                <div className={styles.sectionTitle}>
                  <span>EN LIGNE — {onlineFriends.length}</span>
                </div>
                {onlineFriends.length === 0 && (
                  <EmptyState message="Aucun ami en ligne." />
                )}
                {onlineFriends.map((rel) => (
                  <FriendRow
                    key={rel.user.id}
                    rel={rel}
                    onOpenDM={handleOpenDM}
                    onRemove={handleRemove}
                    onBlock={handleBlock}
                    onOpenNote={handleOpenNote}
                    onContextMenu={(x, y) => setContextMenu({ x, y, rel })}
                  />
                ))}

                <div className={styles.sectionTitle} style={{ marginTop: 16 }}>
                  <span>TOUS LES AMIS — {filteredFriends.length}</span>
                </div>
                {filteredFriends.length === 0 && !search && (
                  <EmptyState message="Tu n'as encore aucun ami." />
                )}
                {filteredFriends.length === 0 && search && (
                  <EmptyState message={`Aucun ami trouvé pour "${search}".`} />
                )}
                {filteredFriends.map((rel) => (
                  <FriendRow
                    key={rel.user.id}
                    rel={rel}
                    onOpenDM={handleOpenDM}
                    onRemove={handleRemove}
                    onBlock={handleBlock}
                    onOpenNote={handleOpenNote}
                    onContextMenu={(x, y) => setContextMenu({ x, y, rel })}
                  />
                ))}
              </>
            )}

            {activeTab === 'pending' && (
              <div>
                {pendingIncoming.length > 0 && (
                  <div className={styles.pendingSection}>
                    <div className={styles.pendingTitle}>Demandes reçues ({pendingIncoming.length})</div>
                    {pendingIncoming.map((rel) => (
                      <div key={rel.user.id} className={styles.friendRow}>
                        <div className={styles.avatarWrap}>
                          <UserAvatar user={rel.user} />
                        </div>
                        <div className={styles.friendInfo}>
                          <div className={styles.friendName}>{rel.user.global_name || rel.user.username}</div>
                          <div className={styles.friendMeta}>Demande reçue</div>
                        </div>
                        <div className={styles.friendActions} style={{ opacity: 1 }}>
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnAccept}`}
                            onClick={() => handleAccept(rel.user.id)}
                            title="Accepter"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                            onClick={() => handleDecline(rel.user.id)}
                            title="Refuser"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {pendingOutgoing.length > 0 && (
                  <div className={styles.pendingSection}>
                    <div className={styles.pendingTitle}>Demandes envoyées ({pendingOutgoing.length})</div>
                    {pendingOutgoing.map((rel) => (
                      <div key={rel.user.id} className={styles.friendRow}>
                        <div className={styles.avatarWrap}>
                          <UserAvatar user={rel.user} />
                        </div>
                        <div className={styles.friendInfo}>
                          <div className={styles.friendName}>{rel.user.global_name || rel.user.username}</div>
                          <div className={styles.friendMeta}>Demande envoyée</div>
                        </div>
                        <div className={styles.friendActions} style={{ opacity: 1 }}>
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                            onClick={() => handleRemove(rel.user.id)}
                            title="Annuler"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
                  <EmptyState message="Aucune demande en attente." />
                )}
              </div>
            )}

            {activeTab === 'blocked' && (
              <>
                <div className={styles.sectionTitle}>
                  <span>BLOQUÉS — {blocked.length}</span>
                </div>
                {blocked.length === 0 && (
                  <EmptyState message="Tu n'as bloqué personne." />
                )}
                {blocked.map((rel) => (
                  <div key={rel.user.id} className={styles.friendRow}>
                    <div className={styles.avatarWrap}>
                      <UserAvatar user={rel.user} />
                    </div>
                    <div className={styles.friendInfo}>
                      <div className={styles.friendName}>{rel.user.global_name || rel.user.username}</div>
                      <div className={styles.friendMeta}>Bloqué</div>
                    </div>
                    <div className={styles.friendActions} style={{ opacity: 1 }}>
                      <button
                        className={styles.actionBtn}
                        onClick={() => handleUnblock(rel.user.id)}
                        title="Débloquer"
                      >
                        <ShieldBan size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Note Editor Modal */}
      {noteTarget && (
        <div className={styles.noteOverlay} onClick={(e) => e.target === e.currentTarget && setNoteTarget(null)}>
          <div className={styles.noteModal}>
            <div className={styles.noteHeader}>
              <div className={styles.noteHeaderTitle}>Note pour {noteTarget.user.global_name || noteTarget.user.username}</div>
              <button className={styles.noteCloseBtn} onClick={() => setNoteTarget(null)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.noteBody}>
              <UserNoteEditor
                targetUserId={noteTarget.user.id}
                targetUsername={noteTarget.user.global_name || noteTarget.user.username}
                onSaved={() => setNoteTarget(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className={styles.contextMenuItem} onClick={() => { handleOpenDM(contextMenu.rel.user.id); setContextMenu(null); }}>
            <MessageCircle size={16} />
            Envoyer un message
          </div>
          <div className={styles.contextMenuItem} onClick={() => { handleOpenNote(contextMenu.rel); setContextMenu(null); }}>
            <FileText size={16} />
            Ajouter une note
          </div>
          <div className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`} onClick={() => { handleBlock(contextMenu.rel.user.id); setContextMenu(null); }}>
            <ShieldBan size={16} />
            Bloquer
          </div>
          <div className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`} onClick={() => { handleRemove(contextMenu.rel.user.id); setContextMenu(null); }}>
            <UserX size={16} />
            Retirer de la liste d'amis
          </div>
        </div>
      )}
    </div>
  );
}

function FriendRow({
  rel, onOpenDM, onRemove, onBlock, onOpenNote, onContextMenu,
}: {
  rel: Relationship;
  onOpenDM: (userId: string) => void;
  onRemove: (userId: string) => void;
  onBlock: (userId: string) => void;
  onOpenNote: (rel: Relationship) => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  return (
    <div
      className={styles.friendRow}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
      data-testid={`friend-row-${rel.user.id}`}
    >
      <div className={styles.avatarWrap}>
        <UserAvatar user={rel.user} />
        <span className={`${styles.statusDot} ${getStatusClass(rel.user.status || 'offline', styles)}`} />
      </div>
      <div className={styles.friendInfo}>
        <div className={styles.friendName}>{rel.user.global_name || rel.user.username}</div>
        <div className={styles.friendMeta}>{getStatusLabel(rel.user.status || 'offline', rel.user.custom_status_text)}</div>
      </div>

      <div className={styles.friendActions}>
        <button className={styles.actionBtn} onClick={() => onOpenNote(rel)} title="Note">
          <FileText size={14} />
        </button>
        <button className={styles.actionBtn} onClick={() => onOpenDM(rel.user.id)} title="Envoyer un message" data-testid={`friend-message-${rel.user.id}`}>
          <MessageCircle size={16} />
        </button>
        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => onRemove(rel.user.id)} title="Retirer">
          <UserX size={16} />
        </button>
      </div>
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
      const relationship = await api<{ id: string; type: number; user?: any }>('/api/relationships', {
        method: 'POST',
        body: JSON.stringify({ username, discriminator }),
      });
      if (relationship.user) upsertRelationship(relationship as any);
      setSuccess(true);
      setMsg(`Demande envoyée à ${username} !`);
      setInput('');
    } catch (e: any) {
      setMsg(e.message || "Erreur lors de l'envoi de la demande.");
    }
    setLoading(false);
  };

  return (
    <div className={styles.addPanel}>
      <div className={styles.addTitle}>Ajouter un ami</div>
      <div className={styles.addDesc}>
        Tu peux ajouter quelqu'un avec son nom d'utilisateur et son identifiant. Les demandes doivent être acceptées pour devenir amis.
      </div>
      <div className={styles.addRow}>
        <input
          className={styles.addInput}
          placeholder="NomUtilisateur#0000"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          data-testid="add-friend-input"
        />
        <button className={styles.addBtn} onClick={handleSend} disabled={loading || !input.trim()} data-testid="add-friend-submit">
          {loading ? 'Envoi...' : 'Envoyer une demande'}
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
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>
        <Users size={32} />
      </div>
      {message}
    </div>
  );
}
