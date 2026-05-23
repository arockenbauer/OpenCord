import { MouseEvent, useState, useRef, useEffect } from 'react';
import { Hash, Volume2, Megaphone, ChevronDown, ChevronRight, Plus, Settings, Mic, MicOff, Headphones, MessageCircle, UserPlus, Users, LogOut, Trash2, Edit3, Trash, Copy, Link, PhoneOff, X, Lock, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { GatewayEvents } from '@opencord/shared';
import { CreateChannelModal } from '../modals/CreateChannelModal';
import { Tooltip } from '../Tooltip/Tooltip';
import { api } from '../../services/api';
import styles from './ChannelSidebar.module.css';

const channelIcons: Record<number, any> = {
  0: Hash,
  2: Volume2,
  13: Volume2,
  14: Volume2,
  4: undefined,
  5: Megaphone,
  11: MessageCircle,
  15: MessageCircle,
};

export function ChannelSidebar() {
  const { t } = useTranslation();
  const guild = useGuildStore((s) => s.getSelectedGuild());
  const guilds = useGuildStore((s) => s.guilds);
  const dmChannels = useGuildStore((s) => s.dmChannels);
  const selectedChannelId = useGuildStore((s) => s.selectedChannelId);
  const selectChannel = useGuildStore((s) => s.selectChannel);
  const joinVoiceChannel = useVoiceStore((s) => s.joinVoiceChannel || (() => {}));
  const voiceChannelId = useVoiceStore((s) => s.channelId);
  const voiceGuildId = useVoiceStore((s) => s.guildId);
  const user = useAuthStore((s) => s.user);
  const relationships = useAuthStore((s) => s.relationships);
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
  const [newDMOpen, setNewDMOpen] = useState(false);
  const [newDMSearch, setNewDMSearch] = useState('');
  const guildMenuRef = useRef<HTMLDivElement>(null);

  const openOwnProfile = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    useUIStore.getState().setProfilePopover?.({ userId: user!.id, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };

  const openUserProfile = (event: MouseEvent<HTMLElement>, userId: string) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    useUIStore.getState().setProfilePopover?.({ userId, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };

  const createInviteForGuild = async (targetGuild: any) => {
    const inviteChannel = targetGuild.channels?.find((channel: any) => channel.type === 0 || channel.type === 5);
    if (!inviteChannel) return null;
    return api<any>(`/api/guilds/${targetGuild.id}/channels/${inviteChannel.id}/invites`, {
      method: 'POST',
      body: JSON.stringify({
        max_age: 604800,
        max_uses: 0,
        temporary: false,
        unique: false,
        source: 'dm_context_menu',
      }),
    });
  };

  const inviteUserToGuild = async (recipient: any, targetGuild: any) => {
    if (!recipient || !targetGuild) return;
    const invite = await createInviteForGuild(targetGuild);
    if (!invite?.code) return;
    const inviteUrl = `${window.location.origin}/invite/${invite.code}`;
    const dm = await api.users.createDM<any>(recipient.id);
    useGuildStore.getState().addDMChannel(dm);
    await api.dm.createMessage(dm.id, { content: inviteUrl });
    useGuildStore.getState().selectGuild(null);
    useGuildStore.getState().selectChannel(dm.id);
  };

  const openDMWithUser = async (recipientId: string) => {
    const dm = await api.users.createDM<any>(recipientId);
    useGuildStore.getState().addDMChannel(dm);
    useGuildStore.getState().selectGuild(null);
    useGuildStore.getState().selectChannel(dm.id);
    setNewDMOpen(false);
    setNewDMSearch('');
  };

  const openDMContextMenu = (event: MouseEvent<HTMLDivElement>, channel: any) => {
    const recipient = getDMPrimaryRecipient(channel);
    if (!recipient) return;
    event.preventDefault();
    event.stopPropagation();
    const inviteTargets = Array.from(guilds.values()).filter((item: any) => {
      const isMember = item.members?.some((member: any) => member.user.id === recipient.id);
      return !isMember && item.channels?.some((channelItem: any) => channelItem.type === 0 || channelItem.type === 5);
    });

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: 'Voir le profil',
          icon: <UserPlus size={16} />,
          onClick: () => {
            setTimeout(() => {
              useUIStore.getState().setProfilePopover?.({ userId: recipient.id, x: event.clientX, y: event.clientY, width: 1, height: 1 });
            }, 0);
          },
        },
        {
          label: 'Envoyer un message',
          icon: <MessageCircle size={16} />,
          onClick: () => selectChannel(channel.id),
        },
        ...(inviteTargets.length > 0 ? [{ separator: true }] : []),
        ...inviteTargets.slice(0, 5).map((targetGuild: any) => ({
          label: `Inviter à ${targetGuild.name}`,
          icon: <UserPlus size={16} />,
          onClick: () => void inviteUserToGuild(recipient, targetGuild),
        })),
      ],
    });
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
    const friends = relationships.filter((relationship) => relationship.type === 1);
    const filteredFriends = friends.filter((relationship) => {
      const query = newDMSearch.trim().toLowerCase();
      if (!query) return true;
      const displayName = relationship.user.global_name || relationship.user.username;
      return displayName.toLowerCase().includes(query) || relationship.user.username.toLowerCase().includes(query);
    });

    return (
      <div className={styles.container}>
        <div className={styles.dmHeader}>
          <input className={styles.dmSearch} placeholder={t('common.search')} value={dmSearch} onChange={(e) => setDmSearch(e.target.value)} data-testid="dm-search-input" />
          <Tooltip content="Nouveau MP" position="right" delay={300}>
            <button className={styles.newDMButton} onClick={() => setNewDMOpen(true)} aria-label="Créer un message privé" data-testid="new-dm-button">
              <Plus size={18} />
            </button>
          </Tooltip>
        </div>
        {newDMOpen && (
          <div className={styles.newDMPopover} data-testid="new-dm-popover">
            <div className={styles.newDMHeader}>
              <span>Nouveau message</span>
              <button onClick={() => setNewDMOpen(false)} aria-label="Fermer"><X size={16} /></button>
            </div>
            <input
              className={styles.newDMSearch}
              value={newDMSearch}
              onChange={(event) => setNewDMSearch(event.target.value)}
              placeholder="Sélectionner un ami"
              autoFocus
            />
            <div className={styles.newDMList}>
              {filteredFriends.length === 0 ? (
                <div className={styles.newDMEmpty}>Aucun ami disponible.</div>
              ) : filteredFriends.map((relationship) => {
                const displayName = relationship.user.global_name || relationship.user.username;
                return (
                  <button key={relationship.user.id} className={styles.newDMFriend} onClick={() => void openDMWithUser(relationship.user.id)}>
                    <span className={styles.newDMFriendAvatar}>
                      {relationship.user.avatar ? <img src={relationship.user.avatar} alt="" /> : displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className={styles.newDMFriendInfo}>
                      <span className={styles.newDMFriendName}>{displayName}</span>
                      <span className={styles.newDMFriendTag}>@{relationship.user.username}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className={styles.homeNav}>
          <button
            className={`${styles.homeNavItem} ${selectedChannelId === null ? styles.homeNavItemActive : ''}`}
            onClick={() => selectChannel(null)}
          >
            <Users size={20} />
            <span>Amis</span>
          </button>
        </div>
        <div className={styles.channelList}>
          <div className={styles.sectionLabel}>{t('dm.title')}</div>
          {dmChannels.length === 0 && <div className={styles.dmEmpty}>{t('dm.empty')}</div>}
          {dmChannels.filter((channel) => {
            if (!dmSearch) return true;
            const name = getDMDisplayName(channel).toLowerCase();
            return name.includes(dmSearch.toLowerCase());
          }).map((channel) => {
            const recipient = getDMPrimaryRecipient(channel);
            const displayName = getDMDisplayName(channel);
            return (
            <Tooltip key={channel.id} content={getDMDisplayName(channel)} position="right" delay={300}>
              <div
                className={`${styles.channel} ${selectedChannelId === channel.id ? styles.active : ''}`}
                onClick={() => selectChannel(channel.id)}
                onContextMenu={(event) => openDMContextMenu(event, channel)}
                data-testid={`dm-channel-${channel.id}`}
              >
                {recipient ? (
                  <button
                    type="button"
                    className={styles.dmAvatar}
                    onClick={(event) => openUserProfile(event, recipient.id)}
                    data-user-popout-trigger="true"
                    aria-label={`Ouvrir le profil de ${displayName}`}
                  >
                    {recipient.avatar ? <img src={recipient.avatar} alt="" /> : displayName.slice(0, 1).toUpperCase()}
                    <span className={`${styles.dmStatus} ${getDMStatusClass(recipient.status, styles)}`} />
                  </button>
                ) : (
                  <MessageCircle size={16} />
                )}
                <div className={styles.dmNameStack}>
                  <span className={styles.channelName}>{getDMDisplayName(channel)}</span>
                  <span className={styles.dmMeta}>{getDMSubtitle(channel)}</span>
                </div>
              </div>
            </Tooltip>
          );})}
        </div>
        {user && <UserPanel user={user!} onSettings={() => useUIStore.getState().setShowUserSettings?.(true)} onOpenProfile={openOwnProfile} />}
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
      <div className={styles.header} onClick={toggleGuildMenu} onContextMenu={openServerMenu} data-testid="guild-sidebar-header">
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
          <ChannelItem
            key={ch.id}
            channel={ch}
            isActive={selectedChannelId === ch.id}
            isVoiceConnected={voiceGuildId === guild.id && voiceChannelId === ch.id}
            onClick={() => isVoiceChannel(ch) ? joinVoiceChannel(guild.id, ch.id) : selectChannel(ch.id)}
            onContextMenu={(e) => openChannelContextMenu(e, ch)}
            user={user}
          />
        ))}

        {categories.map((cat) => {
          const collapsed = collapsedCategories.has(cat.id);
          const children = guild.channels.filter((c) => c.parent_id === cat.id && c.type !== 4 && c.type !== 11 && c.type !== 15);
          const threads = guild.channels.filter((c) => c.parent_id === cat.id && (c.type === 11 || c.type === 15));

          return (
            <div key={cat.id}>
              <div className={styles.category} onClick={() => toggleCategory(cat.id)}>
                {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span className={styles.categoryName}>{cat.name}</span>
                <Plus size={16} className={styles.categoryAction} onClick={(e) => { e.stopPropagation(); setCreateChannel({ categoryId: cat.id }); }} />
              </div>
              {!collapsed && children.map((ch) => (
                <div key={ch.id}>
                  <ChannelItem
                    channel={ch}
                    isActive={selectedChannelId === ch.id}
                    isVoiceConnected={voiceGuildId === guild.id && voiceChannelId === ch.id}
                    onClick={() => isVoiceChannel(ch) ? joinVoiceChannel(guild.id, ch.id) : selectChannel(ch.id)}
                    onContextMenu={(e) => openChannelContextMenu(e, ch)}
                    user={user}
                  />
                  {ch.type === 0 || ch.type === 5 ? (
                    <div className={styles.threadList}>
                      {threads
                        .filter((t: any) => t.parent_id === ch.id)
                        .map((thread: any) => (
                          <ChannelItem
                            key={thread.id}
                            channel={thread}
                            isActive={selectedChannelId === thread.id}
                            isVoiceConnected={false}
                            onClick={() => selectChannel(thread.id)}
                            onContextMenu={(e) => openChannelContextMenu(e, thread)}
                            user={user}
                            isThread
                          />
                        ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {!collapsed && threads.filter((t: any) => !t.parent_id || !children.some((c: any) => c.id === t.parent_id)).map((thread: any) => (
                <ChannelItem
                  key={thread.id}
                  channel={thread}
                  isActive={selectedChannelId === thread.id}
                  isVoiceConnected={false}
                  onClick={() => selectChannel(thread.id)}
                  onContextMenu={(e) => openChannelContextMenu(e, thread)}
                  user={user}
                  isThread
                />
              ))}
            </div>
          );
        })}
      </div>

      {user && <UserPanel user={user!} onSettings={() => setShowUserSettings?.(true)} onOpenProfile={openOwnProfile} />}
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

function isVoiceChannel(channel: any): boolean {
  return channel.type === 2 || channel.type === 13 || channel.type === 14;
}

function ChannelItem({ channel, isActive, isVoiceConnected, onClick, onContextMenu, user, isThread: isThreadProp }: { channel: any; isActive: boolean; isVoiceConnected?: boolean; onClick: () => void; onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void; user?: any; isThread?: boolean }) {
  const Icon = channelIcons[channel.type] || Hash;
  const unread = useUnreadStore((s) => s.channelUnreads[channel.id]);
  const hasUnread = unread?.hasUnread && !isActive;
  const mentionCount = unread?.mentionCount || 0;
  const voiceStates = useGuildStore((s) => s.voiceStates);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);
  const members = useGuildStore((s) => s.getSelectedGuild()?.members) || [];

  // For voice channels, show avatars of connected currentUsers
  const isVoice = isVoiceChannel(channel);
  const isThread = isThreadProp || channel.type === 11 || channel.type === 15;
  const connectedUsers = isVoice
    ? (voiceStates.get(channel.guild_id || '') || []).filter((vs: any) => vs.channel_id === channel.id)
    : [];
  const userIds = connectedUsers.map((vs: any) => vs.user_id);
  const avatars = members
    .filter((m: any) => userIds.includes(m.user.id))
    .slice(0, 3)
    .map((m: any) => m.user);

  const userLimit = channel.user_limit || 0;
  const showLimit = userLimit > 0;
  const isFull = showLimit && connectedUsers.length >= userLimit;
  const isConnected = isVoiceConnected || userIds.includes(user?.id || '');

  // For threads, check membership and show member count
  const threadMemberCount = isThread ? (channel.member_count || 0) : 0;
  const isThreadMember = isThread ? (channel.thread_members?.some((m: any) => m.user_id === user?.id) ?? false) : false;

  return (
    <div className={`${styles.channelItemWrapper}`}>
      {hasUnread && <div className={styles.unreadDot} />}
      <div
        className={`${styles.channel} ${isActive ? styles.active : ''} ${hasUnread ? styles.unread : ''} ${isVoice ? styles.voiceChannel : ''}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
        role="button"
        tabIndex={0}
        aria-label={`Salon ${channel.name}${hasUnread ? ' (non lu)' : ''}${mentionCount > 0 ? ` (${mentionCount} mentions)` : ''}`}
        data-testid={`channel-${channel.id}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onClick) onClick(); } }}
        style={{ flex: 1 }}
      >
        {isVoice ? (
          <div className={styles.voiceIndicator}>
            <Volume2 size={16} />
            {connectedUsers.length > 0 && (
              <span className={styles.voiceCount}>{connectedUsers.length}{showLimit ? `/${userLimit}` : ''}</span>
            )}
          </div>
        ) : (
          <div className={styles.channelIconWrapper}>
            <Icon size={16} />
            {channel.overwrite_permissions && channel.overwrite_permissions.length > 0 && (
              <Lock size={10} className={styles.lockIcon} />
            )}
          </div>
        )}
        <span className={`${styles.channelName} ${isFull ? styles.channelFull : ''} ${isThread ? styles.threadChannel : ''}`}>{channel.name}</span>
        {isThread && !isThreadMember && (
          <button className={styles.joinButton} onClick={(e) => { e.stopPropagation(); onClick(); }}>
            Rejoindre
          </button>
        )}
        {isThread && isThreadMember && (
          <span className={styles.connectedBadge}>Membre</span>
        )}
        {isThread && threadMemberCount > 0 && (
          <span className={styles.threadCount}>{threadMemberCount} membre{threadMemberCount > 1 ? 's' : ''}</span>
        )}
        {isVoice && !isConnected && !isFull && (
          <button className={styles.joinButton} onClick={(e) => { e.stopPropagation(); onClick(); }}>
            Rejoindre
          </button>
        )}
        {isVoice && isConnected && (
          <span className={styles.connectedBadge}>Connecté</span>
        )}
        {mentionCount > 0 && (
          <span className={styles.mentionBadge}>{mentionCount > 99 ? '99+' : mentionCount}</span>
        )}
      </div>
      {isVoice && avatars.length > 0 && (
        <div className={styles.voiceUsers}>
          {avatars.map((u: any) => {
            const vs = connectedUsers.find((v: any) => v.user_id === u.id);
            const isSpeaking = speakingUserIds.has(u.id);
            return (
              <div key={u.id} className={`${styles.voiceUserAvatar} ${isSpeaking ? styles.speaking : ''}`} title={u.username}>
                {u.avatar ? <img src={u.avatar} alt="" /> : u.username.slice(0, 1).toUpperCase()}
                {vs?.self_mute && <MicOff size={10} className={styles.voiceIconMute} />}
                {vs?.self_deaf && <Headphones size={10} className={styles.voiceIconDeaf} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserPanel({ user, onSettings, onOpenProfile }: { user: any; onSettings: () => void; onOpenProfile: (event: MouseEvent<HTMLButtonElement>) => void }) {
  const channelId = useVoiceStore((s) => s.channelId);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfDeaf = useVoiceStore((s) => s.selfDeaf);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);
  const toggleSelfMute = useVoiceStore((s) => s.toggleSelfMute);
  const toggleSelfDeaf = useVoiceStore((s) => s.toggleSelfDeaf);
  const leaveVoiceChannel = useVoiceStore((s) => s.leaveVoiceChannel);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const statusPickerRef = useRef<HTMLDivElement>(null);

  const isSpeaking = channelId && speakingUserIds.has(user?.id || '');

  const statuses = [
    { id: 'online', label: 'En ligne', color: 'var(--status-online)', icon: <Circle size={10} fill="currentColor" /> },
    { id: 'idle', label: 'Absent', color: 'var(--status-idle)', icon: <Circle size={10} fill="currentColor" /> },
    { id: 'dnd', label: 'Ne pas déranger', color: 'var(--status-dnd)', icon: <Circle size={10} fill="currentColor" /> },
    { id: 'invisible', label: 'Invisible', color: 'var(--status-offline)', icon: <Circle size={10} fill="currentColor" /> },
  ];

  const currentStatus = user?.status || 'online';

  useEffect(() => {
    if (!showStatusPicker) return;
    const close = (e: MouseEvent) => {
      if (statusPickerRef.current && !statusPickerRef.current.contains(e.target as Node)) {
        setShowStatusPicker(false);
      }
    };
    document.addEventListener('mousedown', close as any);
    return () => document.removeEventListener('mousedown', close as any);
  }, [showStatusPicker]);

  const updateStatus = async (status: string) => {
    try {
      await api('/api/users/me/status', {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setShowStatusPicker(false);
    } catch {
      // ignore
    }
  };

  return (
    <div className={styles.userPanel}>
      <button className={styles.userIdentity} onClick={onOpenProfile} data-user-popout-trigger="true" data-testid="own-profile-trigger">
        <div className={`${styles.userAvatar} ${isSpeaking ? styles.speaking : ''}`}>
          {user.avatar ? <img src={user.avatar} alt="" /> : user.username.slice(0, 1).toUpperCase()}
          <div className={styles.userStatusDot} style={{ background: `var(--status-${currentStatus})` }} onClick={(e) => { e.stopPropagation(); setShowStatusPicker(!showStatusPicker); }} />
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{user.global_name || user.username}</div>
          <div className={styles.userTag}>#{user.discriminator}</div>
        </div>
      </button>
      {showStatusPicker && (
        <div className={styles.statusPicker} ref={statusPickerRef}>
          {statuses.map((status) => (
            <button
              key={status.id}
              className={`${styles.statusOption} ${currentStatus === status.id ? styles.statusOptionActive : ''}`}
              onClick={() => updateStatus(status.id)}
            >
              <span className={styles.statusOptionDot} style={{ background: status.color }}>{status.icon}</span>
              <span>{status.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.userActions}>
        <Tooltip content={selfMute ? 'Réactiver le micro' : 'Couper le micro'} position="top" delay={300}>
          <button onClick={toggleSelfMute} className={selfMute ? styles.actionActive : undefined} aria-pressed={selfMute} data-testid="voice-mute-toggle">
            {selfMute ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        </Tooltip>
        <Tooltip content={selfDeaf ? 'Réactiver le casque' : 'Couper le casque'} position="top" delay={300}>
          <button onClick={toggleSelfDeaf} className={selfDeaf ? styles.actionActive : undefined} aria-pressed={selfDeaf} data-testid="voice-deafen-toggle">
            <Headphones size={16} />
          </button>
        </Tooltip>
        {channelId && (
          <Tooltip content="Quitter le vocal" position="top" delay={300}>
            <button onClick={leaveVoiceChannel} data-testid="voice-leave-button"><PhoneOff size={16} /></button>
          </Tooltip>
        )}
        <Tooltip content="Paramètres" position="top" delay={300}>
          <button onClick={onSettings} data-testid="user-settings-button"><Settings size={16} /></button>
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

function getDMPrimaryRecipient(channel: any): any | null {
  if (!channel.recipients?.length) return null;
  return channel.recipients[0] || null;
}

function getDMStatusClass(status: string, css: Record<string, string>): string {
  if (status === 'online') return css.dmStatusOnline || '';
  if (status === 'idle') return css.dmStatusIdle || '';
  if (status === 'dnd') return css.dmStatusDnd || '';
  return css.dmStatusOffline || '';
}

function getDMSubtitle(channel: any): string {
  if (!channel.recipients?.length) return 'Aucun participant';
  if (channel.recipients.length === 1) {
    return channel.recipients[0]?.custom_status_text || channel.recipients[0]?.status || 'offline';
  }
  return `${channel.recipients.length} participants`;
}
