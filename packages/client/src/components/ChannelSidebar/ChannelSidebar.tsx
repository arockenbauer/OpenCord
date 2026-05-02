import { MouseEvent, useState, useRef, useEffect } from 'react';
import { Hash, Volume2, Megaphone, ChevronDown, ChevronRight, Plus, Settings, Mic, Headphones, MessageCircle, UserPlus, LogOut, Trash2, Edit3, Trash, Copy, Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { CreateChannelModal } from '../modals/CreateChannelModal';
import { Tooltip } from '../Tooltip/Tooltip';
import { api } from '../../services/api';
import styles from './ChannelSidebar.module.css';

const channelIcons: Record<number, any> = {
  0: Hash,
  2: Volume2,
  4: undefined,
  5: Megaphone,
  11: MessageCircle,
  15: MessageCircle,
};

export function ChannelSidebar() {
  const { t } = useTranslation();
  const guild = useGuildStore((s) => s.getSelectedGuild());
  const dmChannels = useGuildStore((s) => s.dmChannels);
  const selectedChannelId = useGuildStore((s) => s.selectedChannelId);
  const selectChannel = useGuildStore((s) => s.selectChannel);
  const user = useAuthStore((s) => s.user);
  const setShowServerSettings = useUIStore((s) => s.setShowServerSettings);
  const setShowUserSettings = useUIStore((s) => s.setShowUserSettings);
  const setActiveServerSettingsTab = useUIStore((s) => s.setActiveServerSettingsTab);
  const setContextMenu = useUIStore((s) => s.setContextMenu);
  const setShowInviteModal = useUIStore((s) => s.setShowInviteModal);
  const setModalData = useUIStore((s) => s.setModalData);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [createChannel, setCreateChannel] = useState<{ categoryId: string | null } | null>(null);
  const [guildMenuOpen, setGuildMenuOpen] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const guildMenuRef = useRef<HTMLDivElement>(null);

  const openOwnProfile = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    useUIStore.getState().setProfilePopover?.({ userId: user!.id, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };

  const toggleGuildMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setGuildMenuOpen((v) => !v);
  };

  useEffect(() => {
    if (!guildMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (guildMenuRef.current && !guildMenuRef.current.contains(e.target as Node)) {
        setGuildMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close as any);
    return () => document.removeEventListener('mousedown', close as any);
  }, [guildMenuOpen]);

  if (!guild) {
    return (
      <div className={styles.container}>
        <div className={styles.dmHeader}>
          <input className={styles.dmSearch} placeholder={t('common.search')} value={dmSearch} onChange={(e) => setDmSearch(e.target.value)} />
        </div>
        <div className={styles.channelList}>
          <div className={styles.sectionLabel}>{t('dm.title')}</div>
          {dmChannels.length === 0 && <div className={styles.dmEmpty}>{t('dm.empty')}</div>}
          {dmChannels.filter((channel) => {
            if (!dmSearch) return true;
            const name = getDMDisplayName(channel).toLowerCase();
            return name.includes(dmSearch.toLowerCase());
          }).map((channel) => (
            <Tooltip key={channel.id} content={getDMDisplayName(channel)} position="right" delay={300}>
              <div
                className={`${styles.channel} ${selectedChannelId === channel.id ? styles.active : ''}`}
                onClick={() => selectChannel(channel.id)}
              >
                <MessageCircle size={16} />
                <div className={styles.dmNameStack}>
                  <span className={styles.channelName}>{getDMDisplayName(channel)}</span>
                  <span className={styles.dmMeta}>{getDMSubtitle(channel)}</span>
                </div>
              </div>
            </Tooltip>
          ))}
        </div>
        {user && <UserPanel user={user} onSettings={() => useUIStore.getState().setShowUserSettings?.(true)} onOpenProfile={openOwnProfile} />}
      </div>
    );
  }

  const categories = guild.channels.filter((c: any) => c.type === 4);
  const orphanChannels = guild.channels.filter((c: any) => c.type !== 4 && !c.parent_id);

  const toggleCategory = (id: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openServerMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const isOwner = user?.id === guild.owner_id;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: 'Inviter des personnes',
          icon: <UserPlus size={16} />,
          onClick: () => {
            const firstTextChannel = (guild.channels as any[]).find((c) => c.type === 0);
            setModalData({ guildId: guild.id, channelId: firstTextChannel?.id || null });
            setShowInviteModal(true);
          },
        },
        {
          label: 'Paramètres du serveur',
          icon: <Settings size={16} />,
          onClick: () => {
            setActiveServerSettingsTab('overview');
            setShowServerSettings(true);
          },
        },
        {
          label: isOwner ? 'Supprimer le serveur' : 'Quitter le serveur',
          icon: isOwner ? <Trash2 size={16} /> : <LogOut size={16} />,
          danger: true,
          onClick: () => {
            setActiveServerSettingsTab('danger');
            setShowServerSettings(true);
          },
        },
      ],
    });
  };

  const openChannelContextMenu = (e: MouseEvent<HTMLDivElement>, channel: any) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Créer un salon',
          icon: <Plus size={16} />,
          onClick: () => setCreateChannel({ categoryId: channel.parent_id || null }),
        },
        {
          label: 'Modifier le salon',
          icon: <Edit3 size={16} />,
          onClick: () => {
            setActiveServerSettingsTab('channels');
            setShowServerSettings(true);
          },
        },
        ...(channel.type === 0 || channel.type === 2 ? [{
          label: 'Supprimer le salon',
          icon: <Trash size={16} />,
          danger: true,
          onClick: () => {
            setActiveServerSettingsTab('channels');
            setShowServerSettings(true);
          },
        }] : []),
      ],
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header} onClick={toggleGuildMenu} onContextMenu={openServerMenu}>
        <span>{guild.name}</span>
        <ChevronDown size={16} className={guildMenuOpen ? styles.chevronOpen : ''} />
      </div>

      {guildMenuOpen && (
        <div className={styles.guildDropdown} ref={guildMenuRef}>
          <div className={styles.guildDropdownHeader}>
            <span className={styles.guildDropdownName}>{guild.name}</span>
          </div>
          <button className={styles.guildDropdownItem} onClick={() => { setGuildMenuOpen(false); const firstTextChannel = (guild.channels as any[]).find((c: any) => c.type === 0); setModalData({ guildId: guild.id, channelId: firstTextChannel?.id || null }); setShowInviteModal(true); }}>
            <UserPlus size={18} />
            <span>Inviter des personnes</span>
          </button>
          <button className={styles.guildDropdownItem} onClick={() => { setGuildMenuOpen(false); setActiveServerSettingsTab('overview'); setShowServerSettings(true); }}>
            <Settings size={18} />
            <span>Paramètres du serveur</span>
          </button>
          <div className={styles.guildDropdownDivider} />
          {user?.id === guild.owner_id ? (
            <button className={`${styles.guildDropdownItem} ${styles.guildDropdownDanger}`} onClick={() => { setGuildMenuOpen(false); setActiveServerSettingsTab('danger'); setShowServerSettings(true); }}>
              <Trash2 size={18} />
              <span>Supprimer le serveur</span>
            </button>
          ) : (
            <button className={`${styles.guildDropdownItem} ${styles.guildDropdownDanger}`} onClick={() => { setGuildMenuOpen(false); setActiveServerSettingsTab('danger'); setShowServerSettings(true); }}>
              <LogOut size={18} />
              <span>Quitter le serveur</span>
            </button>
          )}
        </div>
      )}

      <div className={styles.channelList}>
        {orphanChannels.map((ch) => (
          <ChannelItem key={ch.id} channel={ch} isActive={selectedChannelId === ch.id} onClick={() => selectChannel(ch.id)} onContextMenu={(e) => openChannelContextMenu(e, ch)} />
        ))}

        {categories.map((cat) => {
          const collapsed = collapsedCategories.has(cat.id);
          const children = guild.channels.filter((c) => c.parent_id === cat.id && c.type !== 4);

          return (
            <div key={cat.id}>
              <div className={styles.category} onClick={() => toggleCategory(cat.id)}>
                {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span className={styles.categoryName}>{cat.name}</span>
                <Plus size={16} className={styles.categoryAction} onClick={(e) => { e.stopPropagation(); setCreateChannel({ categoryId: cat.id }); }} />
              </div>
              {!collapsed && children.map((ch) => (
                <ChannelItem key={ch.id} channel={ch} isActive={selectedChannelId === ch.id} onClick={() => selectChannel(ch.id)} onContextMenu={(e) => openChannelContextMenu(e, ch)} />
              ))}
            </div>
          );
        })}
      </div>

      {user && <UserPanel user={user} onSettings={() => setShowUserSettings(true)} onOpenProfile={openOwnProfile} />}
      {createChannel && (
        <CreateChannelModal
          guildId={guild.id}
          categoryId={createChannel.categoryId || undefined}
          onClose={() => setCreateChannel(null)}
          onCreated={() => setCreateChannel(null)}
        />
      )}
    </div>
  );
}

function ChannelItem({ channel, isActive, onClick, onContextMenu }: { channel: any; isActive: boolean; onClick: () => void; onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void }) {
  const Icon = channelIcons[channel.type] || Hash;
  const unread = useUnreadStore((s) => s.channelUnreads[channel.id]);
  const hasUnread = unread?.hasUnread && !isActive;
  const mentionCount = unread?.mentionCount || 0;
  const voiceStates = useGuildStore((s) => s.voiceStates);
  const members = useGuildStore((s) => s.getSelectedGuild()?.members) || [];

  // For voice channels, show avatars of connected users
  const isVoice = channel.type === 2;
  const connectedUsers = isVoice
    ? (voiceStates.get(channel.guild_id || '') || []).filter((vs: any) => vs.channel_id === channel.id)
    : [];
  const userIds = connectedUsers.map((vs: any) => vs.user_id);
  const userAvatars = members
    .filter((m: any) => userIds.includes(m.user.id))
    .slice(0, 3)
    .map((m: any) => m.user);

  return (
    <div className={`${styles.channelItemWrapper}`}>
      {hasUnread && <div className={styles.unreadDot} />}
      <div
        className={`${styles.channel} ${isActive ? styles.active : ''} ${hasUnread ? styles.unread : ''}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{ flex: 1 }}
      >
        {isVoice && userAvatars.length > 0 ? (
          <div className={styles.avatarStack}>
            {userAvatars.map((u: any) => (
              <div key={u.id} className={styles.avatarStackAvatar}>
                {u.avatar ? <img src={u.avatar} alt="" /> : u.username.slice(0, 1).toUpperCase()}
              </div>
            ))}
          </div>
        ) : (
          <Icon size={16} />
        )}
        <span className={styles.channelName}>{channel.name}</span>
        {mentionCount > 0 && (
          <span className={styles.mentionBadge}>{mentionCount > 99 ? '99+' : mentionCount}</span>
        )}
      </div>
    </div>
  );
}

function UserPanel({ user, onSettings, onOpenProfile }: { user: any; onSettings: () => void; onOpenProfile: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <div className={styles.userPanel}>
      <button className={styles.userIdentity} onClick={onOpenProfile} data-user-popout-trigger="true">
        <div className={styles.userAvatar}>
          {user.avatar ? <img src={user.avatar} alt="" /> : user.username.slice(0, 1).toUpperCase()}
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{user.global_name || user.username}</div>
          <div className={styles.userTag}>#{user.discriminator}</div>
        </div>
      </button>
      <div className={styles.userActions}>
        <Tooltip content="Muet" position="top" delay={300}>
          <button><Mic size={16} /></button>
        </Tooltip>
        <Tooltip content="Casque" position="top" delay={300}>
          <button><Headphones size={16} /></button>
        </Tooltip>
        <Tooltip content="Paramètres" position="top" delay={300}>
          <button onClick={onSettings}><Settings size={16} /></button>
        </Tooltip>
      </div>
    </div>
  );
}

function getDMDisplayName(channel: any): string {
  if (channel.name) return channel.name;
  if (!channel.recipients?.length) return 'Conversation';
  if (channel.recipients.length === 1) {
    const recipient = channel.recipients[0];
    return recipient.global_name || recipient.username;
  }
  return channel.recipients.map((recipient: any) => recipient.global_name || recipient.username).join(', ');
}

function getDMSubtitle(channel: any): string {
  if (!channel.recipients?.length) return 'Aucun participant';
  if (channel.recipients.length === 1) {
    return channel.recipients[0]?.custom_status_text || channel.recipients[0]?.status || 'offline';
  }
  return `${channel.recipients.length} participants`;
}
