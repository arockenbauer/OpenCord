import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, ShieldBan, UserPlus, UserRoundCheck, X, Reply, Copy, Edit2, Trash2, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import type { DMChannel } from '../../stores/guildStore';
import { useUIStore } from '../../stores/uiStore';
import { useGateway } from '../../hooks/useGateway';
import { api } from '../../services/api';
import { ServerList } from '../../components/ServerList/ServerList';
import { ChannelSidebar } from '../../components/ChannelSidebar/ChannelSidebar';
import { ChatArea } from '../../components/ChatArea/ChatArea';
import { MemberList } from '../../components/MemberList/MemberList';
import { CreateGuildModal } from '../../components/Modal/CreateGuildModal';
import { NotificationBell } from '../../components/NotificationBell/NotificationBell';
import { InviteModal } from '../../components/modals/InviteModal';
import { GuildBoostPage } from '../Guild/GuildBoostPage';
import { UserSettingsPage } from '../Settings/UserSettingsPage';
import { ServerSettingsPage } from '../ServerSettings/ServerSettingsPage';
import { FriendsView } from '../../components/FriendsView/FriendsView';
import { AnnouncementBanner } from '../../components/AnnouncementBanner/AnnouncementBanner';
import { Badge } from '../../components/Badge/Badge';
import { UserNoteEditor } from '../../components/UserNoteEditor/UserNoteEditor';
import { QuickSwitcher } from '../../components/QuickSwitcher/QuickSwitcher';
import { useKeyboardShortcuts, DEFAULT_SHORTCUTS, getShortcutKey } from '../../hooks/useKeyboardShortcuts.js';
import { applyClientPluginPreferences } from '../../utils/plugins';
import styles from './AppLayout.module.css';

const PROFILE_POPOUT_WIDTH = 340;
const PROFILE_POPOUT_HEIGHT = 620;
const PROFILE_POPOUT_GAP = 12;
const VIEWPORT_PADDING = 8;

export function AppLayout() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const showCreateGuild = useUIStore((s) => s.showCreateGuild);
  const showUserSettings = useUIStore((s) => s.showUserSettings);
  const showServerSettings = useUIStore((s) => s.showServerSettings);
  const activeServerSettingsTab = useUIStore((s) => s.activeServerSettingsTab);
  const showInviteModal = useUIStore((s) => s.showInviteModal);
  const setShowInviteModal = useUIStore((s) => s.setShowInviteModal);
  const modalData = useUIStore((s) => s.modalData);
  const profilePopover = useUIStore((s) => s.profilePopover);
  const setProfilePopover = useUIStore((s) => s.setProfilePopover);
  const contextMenu = useUIStore((s) => s.contextMenu);
  const setContextMenu = useUIStore((s) => s.setContextMenu);
  const selectedGuildId = useGuildStore((s) => s.selectedGuildId);
  const selectedChannelId = useGuildStore((s) => s.selectedChannelId);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);

  useGateway();

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: getShortcutKey(DEFAULT_SHORTCUTS.QUICK_SWITCHER.win),
        callback: () => setShowQuickSwitcher(prev => !prev),
      },
      {
        key: getShortcutKey(DEFAULT_SHORTCUTS.OPEN_SETTINGS.win),
        callback: () => useUIStore.getState().setShowUserSettings(true),
      },
    ],
  });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchMe();
  }, [isAuthenticated, navigate, fetchMe]);

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.theme) document.documentElement.dataset.theme = currentUser.theme;
    if (currentUser.font_size) document.documentElement.style.fontSize = `${currentUser.font_size}px`;
  }, [currentUser?.theme, currentUser?.font_size]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    api.plugins.getUserSettings<any[]>()
      .then((preferences) => {
        if (!cancelled) applyClientPluginPreferences(preferences as any);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentUser?.id]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [contextMenu, setContextMenu]);

  useEffect(() => {
    if (!profilePopover) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-user-popout="true"]') || target.closest('[data-user-popout-trigger="true"]')) {
        return;
      }
      setProfilePopover(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfilePopover(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [profilePopover, setProfilePopover]);

  const showFriendsView = !selectedGuildId && !selectedChannelId;

  if (!isAuthenticated) return null;

  return (
    <>
      <a href="#main-chat" className="sr-only">Aller au contenu principal</a>
      <AnnouncementBanner />
      <NotificationBell />
      <div className={styles.layout}>
        <ServerList />
        <ChannelSidebar />
        <main id="main-chat" className={styles.mainRegion}>
          {showFriendsView ? <FriendsView /> : <ChatArea />}
        </main>
        {selectedGuildId && <MemberList />}
      </div>
      {showCreateGuild && <CreateGuildModal />}
      {showUserSettings && <UserSettingsPage />}
      {selectedGuildId && showServerSettings ? <ServerSettingsPage /> : null}
      {showInviteModal && (
        <InviteModal
          guildId={modalData?.guildId || selectedGuildId || ''}
          channelId={modalData?.channelId || selectedChannelId || ''}
          onClose={() => setShowInviteModal(false)}
        />
      )}
      {profilePopover && <UserProfilePopout />}
      {contextMenu && <ContextMenuLayer />}
      <div aria-live="polite" aria-atomic="false" className="sr-only" id="aria-live-messages"></div>
      <div aria-live="assertive" aria-atomic="false" className="sr-only" id="aria-live-mentions"></div>
    </>
  );
}

function ContextMenuLayer() {
  const contextMenu = useUIStore((s) => s.contextMenu);
  const setContextMenu = useUIStore((s) => s.setContextMenu);

  if (!contextMenu) return null;

  const menuW = 240;
  const menuH = Math.min(contextMenu.items.length * 40 + 12, 400);
  const left = Math.min(contextMenu.x, window.innerWidth - menuW - 8);
  const top = Math.min(contextMenu.y, window.innerHeight - menuH - 8);

  const handleKeyDown = (event: React.KeyboardEvent, item: any, index: number) => {
    if (event.key === 'Escape') {
      setContextMenu(null);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = event.currentTarget.nextElementSibling as HTMLElement | null;
      next?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = event.currentTarget.previousElementSibling as HTMLElement | null;
      if (prev) prev.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      item.onClick?.();
      setContextMenu(null);
    }
  };

  return (
    <div
      className={styles.contextMenu}
      style={{ left, top }}
      role="menu"
      aria-label="Actions"
      onClick={(e) => e.stopPropagation()}
    >
      {contextMenu.items.map((item: any, index: number) => {
        if (item.separator) {
          return <div key={`sep-${index}`} className={styles.contextMenuDivider} role="separator" />;
        }
        const iconEl = item.icon && typeof item.icon === 'object' ? item.icon : null;
        return (
          <button
            key={`${item.label}-${index}`}
            className={`${styles.contextMenuItem} ${item.danger ? styles.contextMenuItemDanger : ''}`}
            role="menuitem"
            tabIndex={0}
            onClick={() => {
              setContextMenu(null);
              item.onClick?.();
            }}
            onKeyDown={(e) => handleKeyDown(e, item, index)}
          >
            {iconEl}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function UserProfilePopout() {
  const currentUser = useAuthStore((s) => s.user);
  const relationships = useAuthStore((s) => s.relationships);
  const upsertRelationship = useAuthStore((s) => s.upsertRelationship);
  const removeRelationshipByUserId = useAuthStore((s) => s.removeRelationshipByUserId);
  const selectedGuild = useGuildStore((s) => s.getSelectedGuild());
  const addDMChannel = useGuildStore((s) => s.addDMChannel);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const selectChannel = useGuildStore((s) => s.selectChannel);
  const profilePopover = useUIStore((s) => s.profilePopover);
  const setProfilePopover = useUIStore((s) => s.setProfilePopover);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!profilePopover) return;

    let mounted = true;
    setLoading(true);
    setError('');
    setProfile(null);

    const query = selectedGuild?.id ? `?guild_id=${encodeURIComponent(selectedGuild.id)}` : '';
    api(`/api/users/${profilePopover.userId}${query}`)
      .then((data) => {
        if (!mounted) return;
        setProfile(data);
      })
      .catch((err: any) => {
        if (!mounted) return;
        setError(err.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [profilePopover, selectedGuild?.id]);

  const position = useMemo(() => {
    if (!profilePopover) return { left: VIEWPORT_PADDING, top: VIEWPORT_PADDING };
    const nextToTrigger = profilePopover.x + profilePopover.width + PROFILE_POPOUT_GAP;
    const fitsRight = nextToTrigger + PROFILE_POPOUT_WIDTH <= window.innerWidth - VIEWPORT_PADDING;
    const left = fitsRight
      ? nextToTrigger
      : Math.max(VIEWPORT_PADDING, profilePopover.x - PROFILE_POPOUT_WIDTH - PROFILE_POPOUT_GAP);
    const top = Math.min(
      Math.max(VIEWPORT_PADDING, profilePopover.y - 20),
      Math.max(VIEWPORT_PADDING, window.innerHeight - PROFILE_POPOUT_HEIGHT - VIEWPORT_PADDING),
    );
    return { left, top };
  }, [profilePopover]);

  if (!profilePopover) return null;

  const fallbackRelationship = relationships.find((relationship) => relationship.user.id === profilePopover.userId);
  const relationshipType = profile?.relationship_type ?? fallbackRelationship?.type ?? null;
  const isSelf = currentUser?.id === profile?.id;
  const primaryAction = getPrimaryRelationshipAction(relationshipType);
  const badgeCount = profile?.badges?.length || 0;
  const roles = profile?.guild_member?.roles || [];
  const mutualGuilds = profile?.mutual_guilds || [];
  const mutualFriends = profile?.mutual_friends || [];

  const close = () => setProfilePopover(null);

  const handleOpenDM = async () => {
    if (!profile) return;
    setActionLoading('dm');
    try {
      const channel = await api.users.createDM<DMChannel>(profile.id);
      addDMChannel(channel);
      selectGuild(null);
      selectChannel(channel.id);
      close();
    } catch (err: any) {
      setError(err.message);
    }
    setActionLoading(null);
  };

  const handleRelationshipAction = async () => {
    if (!profile || !primaryAction) return;
    setActionLoading('relationship');
    try {
      if (primaryAction === 'add' || primaryAction === 'accept') {
        if (primaryAction === 'accept') {
          const result = await api.friends.accept<{ id: string; type: number }>(profile.id);
          upsertRelationship({
            id: result.id,
            type: 1,
            user: {
              id: profile.id,
              username: profile.username,
              discriminator: profile.discriminator,
              avatar: profile.avatar,
              status: profile.status,
              global_name: profile.global_name,
              custom_status_text: profile.custom_status_text,
            },
          });
          setProfile((prev: any) => prev ? { ...prev, relationship_type: 1 } : prev);
        } else {
          const relationship = await api<{ id: string; type: number }>('/api/relationships', {
            method: 'POST',
            body: JSON.stringify({ username: profile.username, discriminator: profile.discriminator }),
          });
          upsertRelationship({
            id: relationship.id,
            type: relationship.type,
            user: {
              id: profile.id,
              username: profile.username,
              discriminator: profile.discriminator,
              avatar: profile.avatar,
              status: profile.status,
              global_name: profile.global_name,
              custom_status_text: profile.custom_status_text,
            },
          });
          setProfile((prev: any) => prev ? { ...prev, relationship_type: relationship.type } : prev);
        }
      } else {
        await api.friends.remove(profile.id);
        removeRelationshipByUserId(profile.id);
        setProfile((prev: any) => prev ? { ...prev, relationship_type: null } : prev);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setActionLoading(null);
  };

  const handleBlockToggle = async () => {
    if (!profile) return;
    setActionLoading('block');
    try {
      if (relationshipType === 2) {
        await api.friends.unblock(profile.id);
        removeRelationshipByUserId(profile.id);
        setProfile((prev: any) => prev ? { ...prev, relationship_type: null } : prev);
      } else {
        await api.friends.block(profile.id);
        upsertRelationship({
          id: fallbackRelationship?.id || `blocked:${profile.id}`,
          type: 2,
          user: {
            id: profile.id,
            username: profile.username,
            discriminator: profile.discriminator,
            avatar: profile.avatar,
            status: profile.status,
            global_name: profile.global_name,
            custom_status_text: profile.custom_status_text,
          },
        });
        setProfile((prev: any) => prev ? { ...prev, relationship_type: 2 } : prev);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setActionLoading(null);
  };

  return (
    <div className={styles.profilePopout} style={position} data-user-popout="true">
      {loading ? (
        <div className={styles.profileLoading}>Chargement…</div>
      ) : error ? (
        <div className={styles.profileLoading}>{error}</div>
      ) : profile ? (
        <>
          <div
            className={styles.popoutBanner}
            style={profile.banner
              ? { backgroundImage: `url(${profile.banner})` }
              : profile.banner_color
                ? { background: profile.banner_color }
                : profile.accent_color
                  ? { background: profile.accent_color }
                  : undefined}
          />
          <div className={styles.popoutBody}>
            <div className={styles.popoutTopRow}>
              <div className={styles.popoutAvatarWrap}>
                <div className={styles.popoutAvatar}>
                  {profile.avatar
                    ? <img src={profile.avatar} alt="" />
                    : (profile.global_name || profile.username).slice(0, 1).toUpperCase()}
                </div>
                <span className={`${styles.popoutStatus} ${getStatusClass(profile.status, styles)}`} />
              </div>
              {!isSelf && (
                <button className={styles.popoutClose} onClick={close}>
                  <X size={16} />
                </button>
              )}
            </div>

            <div className={styles.popoutCard}>
              <div className={styles.popoutNameRow}>
                <div className={styles.popoutName}>{profile.global_name || profile.username}</div>
              </div>
              <div className={styles.popoutTag}>{profile.username}#{profile.discriminator}</div>

              {(profile.custom_status_text || profile.custom_status_emoji) && (
                <div className={styles.popoutCustomStatus}>
                  <span>{profile.custom_status_emoji || '💬'}</span>
                  <span>{profile.custom_status_text || 'Statut personnalisé'}</span>
                </div>
              )}

              {profile.bio && <div className={styles.popoutBio}>{profile.bio}</div>}

              {badgeCount > 0 && (
                <div className={styles.popoutBadgeRow}>
                  {profile.badges.map((badge: any) => (
                    <Badge key={badge.id} badge={badge} variant="card" />
                  ))}
                </div>
              )}
            </div>

            {!isSelf && (
              <div className={styles.popoutActions}>
                <button className={styles.popoutPrimaryAction} onClick={handleOpenDM} disabled={actionLoading !== null}>
                  <MessageCircle size={16} />
                  <span>{actionLoading === 'dm' ? 'Ouverture…' : 'Envoyer un message'}</span>
                </button>
                {primaryAction && (
                  <button className={styles.popoutSecondaryAction} onClick={handleRelationshipAction} disabled={actionLoading !== null || primaryAction === 'pending'}>
                    {relationshipType === 1 ? <UserRoundCheck size={16} /> : <UserPlus size={16} />}
                    <span>{getRelationshipActionLabel(primaryAction)}</span>
                  </button>
                )}
                <button className={styles.popoutDangerAction} onClick={handleBlockToggle} disabled={actionLoading !== null}>
                  <ShieldBan size={16} />
                  <span>{relationshipType === 2 ? 'Débloquer' : 'Bloquer'}</span>
                </button>
              </div>
            )}

            <div className={styles.popoutSection}>
              <div className={styles.popoutSectionTitle}>Membre depuis</div>
              <div className={styles.popoutSectionValue}>{formatProfileDate(profile.created_at)}</div>
            </div>

            {profile.guild_member?.joined_at && (
              <div className={styles.popoutSection}>
                <div className={styles.popoutSectionTitle}>Sur ce serveur depuis</div>
                <div className={styles.popoutSectionValue}>{formatProfileDate(profile.guild_member.joined_at)}</div>
              </div>
            )}

            {roles.length > 0 && (
              <div className={styles.popoutSection}>
                <div className={styles.popoutSectionTitle}>Rôles sur ce serveur</div>
                <div className={styles.popoutRoleList}>
                  {roles.map((role: any) => (
                    <span key={role.id} className={styles.popoutRole} style={role.color ? { borderColor: role.color, color: role.color } : undefined}>
                      {role.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {mutualGuilds.length > 0 && (
              <div className={styles.popoutSection}>
                <div className={styles.popoutSectionTitle}>Serveurs en commun — {mutualGuilds.length}</div>
                <div className={styles.popoutList}>
                  {mutualGuilds.map((guild: any) => (
                    <div key={guild.id} className={styles.popoutListItem}>
                      <div className={styles.popoutListAvatar}>{guild.icon ? <img src={guild.icon} alt="" /> : guild.name.slice(0, 1).toUpperCase()}</div>
                      <span>{guild.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mutualFriends.length > 0 && (
              <div className={styles.popoutSection}>
                <div className={styles.popoutSectionTitle}>Amis en commun — {mutualFriends.length}</div>
                <div className={styles.popoutList}>
                  {mutualFriends.map((friend: any) => (
                    <div key={friend.id} className={styles.popoutListItem}>
                      <div className={styles.popoutListAvatar}>{friend.avatar ? <img src={friend.avatar} alt="" /> : (friend.global_name || friend.username).slice(0, 1).toUpperCase()}</div>
                      <span>{friend.global_name || friend.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isSelf && (
              <div className={styles.popoutSection}>
                <UserNoteEditor
                  targetUserId={profile.id}
                  targetUsername={profile.global_name || profile.username}
                />
              </div>
            )}
          </div>
        </>
      ) : null}

      <QuickSwitcher open={showQuickSwitcher} onClose={() => setShowQuickSwitcher(false)} />
    </div>
  );
}

function getPrimaryRelationshipAction(type: number | null) {
  if (type === 0) return 'pending';
  if (type === 1) return 'remove';
  if (type === 2) return null;
  if (type === 3) return 'accept';
  return 'add';
}

function getRelationshipActionLabel(action: string) {
  if (action === 'pending') return 'Demande envoyée';
  if (action === 'remove') return 'Retirer des amis';
  if (action === 'accept') return 'Accepter la demande';
  return 'Ajouter en ami';
}

function getStatusClass(status: string, css: Record<string, string>) {
  if (status === 'online') return css.popoutStatusOnline;
  if (status === 'idle') return css.popoutStatusIdle;
  if (status === 'dnd') return css.popoutStatusDnd;
  return css.popoutStatusOffline;
}

function formatProfileDate(value: string) {
  return format(new Date(value), 'dd/MM/yyyy');
}
