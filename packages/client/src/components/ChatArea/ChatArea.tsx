import { useState, useEffect, useRef, useCallback, KeyboardEvent, MouseEvent, ChangeEvent, useMemo } from 'react';
import { Hash, Pin, Users, Search, PlusCircle, Smile, X, Reply, MoreHorizontal, Trash2, MessageCircle, UserPlus, Zap, Info, Volume2, Mic, MicOff, Headphones, PhoneOff, Video, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import MarkdownIt from 'markdown-it';
import { useGuildStore } from '../../stores/guildStore';
import { useMessageStore } from '../../stores/messageStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { EmojiPicker } from '../EmojiPicker/EmojiPicker';
import { SlashCommandAutocomplete } from '../SlashCommandAutocomplete/SlashCommandAutocomplete';
import { MessageContextMenu } from '../context-menus/MessageContextMenu';
import { Tooltip } from '../Tooltip/Tooltip';
import { VoiceVideo } from '../VoiceVideo/VoiceVideo';
import { ThreadsPanel } from './ThreadsPanel';
import { emitTyping } from '../../hooks/useGateway';
import { api } from '../../services/api';
import { announceMessage, announceTyping, announceChannelChange } from '../../utils/ariaAnnounce';
import styles from './ChatArea.module.css';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

md.block.ruler.before('paragraph', 'discord_subtext', (state: any, startLine: number, _endLine: number, silent: boolean) => {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  const marker = state.src.slice(start, start + 2);
  const afterMarker = state.src.charCodeAt(start + 2);

  if (marker !== '-#' || (afterMarker !== 0x20 && afterMarker !== 0x09)) return false;
  if (silent) return true;

  const content = state.src.slice(start + 3, max).trim();
  const open = state.push('discord_subtext_open', 'div', 1);
  open.attrSet('class', styles.discordSubtext);
  const inline = state.push('inline', '', 0);
  inline.content = content;
  inline.children = [];
  state.push('discord_subtext_close', 'div', -1);
  state.line = startLine + 1;
  return true;
});

export function ChatArea() {
  const { t } = useTranslation();
  const guild = useGuildStore((s) => s.getSelectedGuild());
  const channel = useGuildStore((s) => s.getSelectedChannel());
  const selectedChannelId = useGuildStore((s) => s.selectedChannelId);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const selectChannel = useGuildStore((s) => s.selectChannel);
  const addChannel = useGuildStore((s) => s.addChannel);
  const updateGuildChannel = useGuildStore((s) => s.updateChannel);
  const confirmedMessages = useMessageStore((s) => selectedChannelId ? s.messages.get(selectedChannelId) || [] : []);
  const pendingMessages = useMessageStore((s) => selectedChannelId ? Array.from(s.pendingMessages.values()).filter((pm) => pm.channel_id === selectedChannelId) : []);
  const messages = useMemo(() => {
    const combined = [...confirmedMessages, ...pendingMessages];
    const byId = new Map(combined.map((m) => [m.id, m]));
    return [...byId.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [confirmedMessages, pendingMessages]);
  const isLoading = useMessageStore((s) => s.isLoading);
  const hasMore = useMessageStore((s) => selectedChannelId ? s.hasMore.get(selectedChannelId) ?? true : false);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const sendMessage = useMessageStore((s) => s.sendMessage);
  const retryMessage = useMessageStore((s) => s.retryMessage);
  const editMessage = useMessageStore((s) => s.editMessage);
  const deleteMessage = useMessageStore((s) => s.deleteMessage);
  const typingUsers = useMessageStore((s) => selectedChannelId ? s.typingUsers.get(selectedChannelId) : undefined);
  const currentUser = useAuthStore((s) => s.user);
  const toggleMemberList = useUIStore((s) => s.toggleMemberList);
  const setProfilePopover = useUIStore((s) => s.setProfilePopover);
  const channelUnread = useUnreadStore((s) => selectedChannelId ? s.channelUnreads[selectedChannelId] : null);
  const lastReadMessageId = channelUnread?.lastMessageId || null;
  const joinVoiceChannel = useVoiceStore((s) => s.joinVoiceChannel);
  const leaveVoiceChannel = useVoiceStore((s) => s.leaveVoiceChannel);
  const toggleSelfMute = useVoiceStore((s) => s.toggleSelfMute);
  const toggleSelfDeaf = useVoiceStore((s) => s.toggleSelfDeaf);
  const voiceChannelId = useVoiceStore((s) => s.channelId);
  const voiceGuildId = useVoiceStore((s) => s.guildId);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfDeaf = useVoiceStore((s) => s.selfDeaf);
  const voiceConnecting = useVoiceStore((s) => s.isConnecting);
  const voiceError = useVoiceStore((s) => s.error);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);

  const [inputValue, setInputValue] = useState('');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSlashAutocomplete, setShowSlashAutocomplete] = useState(false);
  const [pendingSlashCommandId, setPendingSlashCommandId] = useState<string | null>(null);
  const [msgCtxMenu, setMsgCtxMenu] = useState<{ msg: any; x: number; y: number } | null>(null);
  const [sidePanel, setSidePanel] = useState<'pins' | 'search' | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSummary, setSearchSummary] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selectedChannelId && channel && isMessageLikeChannel(channel)) {
      fetchMessages(selectedChannelId);
      useUnreadStore.getState().markRead(selectedChannelId);
    }
  }, [selectedChannelId, channel?.type, fetchMessages]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setInputValue((prev) => prev + detail);
    };
    window.addEventListener('insertMention', handler);
    return () => window.removeEventListener('insertMention', handler);
  }, []);

  useEffect(() => {
    if (inputValue.startsWith('/') && guild) {
      setShowSlashAutocomplete(true);
    } else {
      setShowSlashAutocomplete(false);
      if (!inputValue.startsWith('/')) {
        setPendingSlashCommandId(null);
      }
    }
  }, [inputValue, guild]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!channel || channel.type !== 11 || !channel.parent_id || !currentUser?.id) return;
    api(`/api/channels/${channel.parent_id}/thread/${channel.id}/members/${currentUser.id}`, { method: 'POST' }).catch(() => undefined);
  }, [channel, currentUser?.id]);

  useEffect(() => {
    if (sidePanel !== 'pins' || !selectedChannelId) return;
    let mounted = true;
    setPinsLoading(true);
    api.channels.getPins<{ messages: any[] }>(selectedChannelId)
      .then((data) => {
        if (mounted) setPinnedMessages(data.messages || []);
      })
      .catch(() => {
        if (mounted) setPinnedMessages([]);
      })
      .finally(() => {
        if (mounted) setPinsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedChannelId, sidePanel]);

  useEffect(() => {
    const handlePinsUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.channelId !== selectedChannelId || sidePanel !== 'pins' || !selectedChannelId) return;
      api.channels.getPins<{ messages: any[] }>(selectedChannelId)
        .then((data) => setPinnedMessages(data.messages || []))
        .catch(() => setPinnedMessages([]));
    };
    window.addEventListener('pinsUpdated', handlePinsUpdated);
    return () => window.removeEventListener('pinsUpdated', handlePinsUpdated);
  }, [selectedChannelId, sidePanel]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || !selectedChannelId || isLoading || !hasMore) return;
    if (container.scrollTop < 100 && messages.length > 0) {
      fetchMessages(selectedChannelId, messages[0]?.id);
    }
  }, [selectedChannelId, isLoading, hasMore, messages, fetchMessages]);

  const openProfile = (event: MouseEvent<HTMLElement>, userId: string) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setProfilePopover({ userId, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };

  const handleMessageContextMenu = (event: MouseEvent, message: any) => {
    event.preventDefault();
    if (!message || !message.author) return;
    setMsgCtxMenu({ msg: message, x: event.clientX, y: event.clientY });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSlashAutocomplete) {
        // Let the autocomplete's document-level keydown handler process the selection
        return;
      }
      void handleSend();
    }
    if (e.key === 'Escape') {
      setReplyTo(null);
      setEditingId(null);
    }
    if (e.key === 'ArrowUp' && !inputValue && messages.length > 0) {
      const lastOwn = [...messages].reverse().find((message) => message.author.id === currentUser?.id);
      if (lastOwn) {
        setEditingId(lastOwn.id);
        setEditValue(lastOwn.content || '');
      }
    }

    if (!typingTimeout.current && selectedChannelId) {
      emitTyping(selectedChannelId, guild?.id);
      typingTimeout.current = setTimeout(() => { typingTimeout.current = null; }, 3000);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !selectedChannelId) return;
    const trimmed = inputValue.trim();

    if (trimmed.startsWith('/') && guild && pendingSlashCommandId) {
      const spaceIdx = trimmed.indexOf(' ');
      const rawArgs = spaceIdx !== -1 ? trimmed.slice(spaceIdx + 1).trim() : '';
      try {
        await api.slashCommands.executeCommand(guild.id, {
          command_id: pendingSlashCommandId,
          channel_id: selectedChannelId,
          guild_id: guild.id,
          options: rawArgs || undefined,
        });
      } catch {
        // Server errors are surfaced via the gateway message; ignore here
      }
      setInputValue('');
      setPendingSlashCommandId(null);
      setShowSlashAutocomplete(false);
      setReplyTo(null);
      return;
    }

    sendMessage(selectedChannelId, trimmed, undefined, replyTo?.id);
    setInputValue('');
    setReplyTo(null);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedChannelId) return;
    sendMessage(selectedChannelId, inputValue.trim() || '', Array.from(files), replyTo?.id);
    setInputValue('');
    setReplyTo(null);
    e.target.value = '';
  };

  const handleEditSubmit = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && editingId && selectedChannelId) {
      e.preventDefault();
      await editMessage(selectedChannelId, editingId, editValue);
      setEditingId(null);
      setEditValue('');
    }
    if (e.key === 'Escape') {
      setEditingId(null);
      setEditValue('');
    }
  };

  const handleReaction = async (messageId: string, emoji: string, isBurst?: boolean) => {
    if (!selectedChannelId) return;
    const url = `/api/channels/${selectedChannelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me${isBurst ? '?type=1' : ''}`;
    await api(url, { method: 'PUT' });
  };

  const handleStartThreadFromMessage = async (message: any) => {
    if (!selectedChannelId || !guild) return;
    const defaultName = (message.content || 'Nouveau fil').slice(0, 80);
    const name = window.prompt('Nom du fil', defaultName)?.trim();
    if (!name) return;
    const thread = await api<any>(`/api/channels/${selectedChannelId}/threads`, {
      method: 'POST',
      body: JSON.stringify({ message_id: message.id, name }),
    });
    addChannel(guild.id, thread);
    selectChannel(thread.id);
  };

  const handleCreateForumPost = async () => {
    if (!selectedChannelId || !guild || channel?.type !== 15) return;
    const name = window.prompt('Titre du post', 'Nouveau post')?.trim();
    if (!name) return;
    const thread = await api<any>(`/api/channels/${selectedChannelId}/thread`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    addChannel(guild.id, thread);
    selectChannel(thread.id);
  };

  const handleArchiveThread = async () => {
    if (!channel?.parent_id || channel.type !== 11 || !guild) return;
    const updated = await api<any>(`/api/channels/${channel.parent_id}/thread/${channel.id}/archive`, { method: 'PATCH' });
    updateGuildChannel(guild.id, updated);
  };

  const handleLockThread = async () => {
    if (!channel?.parent_id || channel.type !== 11 || !guild) return;
    const updated = await api<any>(`/api/channels/${channel.parent_id}/thread/${channel.id}/lock`, { method: 'PATCH' });
    updateGuildChannel(guild.id, updated);
  };

  const handleLeaveThread = async () => {
    if (!channel?.parent_id || channel.type !== 11 || !currentUser?.id) return;
    await api(`/api/channels/${channel.parent_id}/thread/${channel.id}/members/${currentUser.id}`, { method: 'DELETE' });
    selectChannel(channel.parent_id);
  };

  const handleSearch = async () => {
    if (!selectedChannelId || !searchQuery.trim()) {
      setSearchResults([]);
      setSearchSummary('');
      return;
    }

    setSearchLoading(true);
    const query = searchQuery.trim();

    try {
      if (guild) {
        const searchableChannels = guild.channels.filter((item: any) => item.type === 0 || item.type === 5 || item.type === 11);
        const responses = await Promise.all(searchableChannels.map(async (searchChannel: any) => {
          try {
            const data = await api.channels.searchMessages<{ messages: any[]; total_results: number }>(searchChannel.id, {
              q: query,
              limit: 10,
              offset: 0,
            });
            return {
              channel: searchChannel,
              messages: data.messages || [],
              total: data.total_results || 0,
            };
          } catch {
            return {
              channel: searchChannel,
              messages: [],
              total: 0,
            };
          }
        }));

        const total = responses.reduce((sum, response) => sum + response.total, 0);
        const merged = responses.flatMap((response) =>
          response.messages.map((message) => ({
            ...message,
            _channelName: response.channel.name,
          })),
        ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setSearchResults(merged);
        setSearchSummary(`${total} résultat${total > 1 ? 's' : ''} dans le serveur`);
      } else {
        const data = await api.channels.searchMessages<{ messages: any[]; total_results: number }>(selectedChannelId, {
          q: query,
          limit: 25,
          offset: 0,
        });
        setSearchResults((data.messages || []).map((message) => ({
          ...message,
          _channelName: channelTitle,
        })));
        setSearchSummary(`${data.total_results || 0} résultat${(data.total_results || 0) > 1 ? 's' : ''} dans cette conversation`);
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const openSearchResult = (result: any) => {
    if (guild) selectGuild(guild.id);
    else selectGuild(null);
    selectChannel(result.channel_id);
    setSidePanel(null);
  };

  const isDirectMessage = !guild;
  const isThread = channel?.type === 11;
  const isForum = channel?.type === 15;
  const isStage = channel?.type === 14;
  const isVoiceLike = channel ? isVoiceLikeChannel(channel) : false;
  const canManageThreads = guild ? hasGuildPermission(guild, currentUser?.id || '', BigInt(0x400000000)) : false;
  const channelTitle = channel ? getConversationTitle(channel, currentUser?.id) : '';
  const headerTopic = channel ? (isDirectMessage ? getConversationSubtitle(channel) : channel.topic) : null;
  const dmProfileUser = isDirectMessage
    ? (channel as any)?.recipients?.find((recipient: any) => recipient.id !== currentUser?.id) || (channel as any)?.recipients?.[0] || null
    : null;
  const messagePlaceholder = isDirectMessage
    ? t('dm.placeholder', { user: channelTitle })
    : t('channel.placeholder', { channel: channel?.name || '' });
  const groupedMessages = groupMessages(messages);
  const guildMembers = guild?.members || [];
  const typingNames = typingUsers ? Array.from(typingUsers)
    .filter((id) => id !== currentUser?.id)
    .map((id) => {
      if (guild) {
        const member = guildMembers.find((item) => item.user.id === id);
        return member?.nickname || member?.user.global_name || member?.user.username || id;
      }
      const recipient = channel?.recipients?.find((item: any) => item.id === id);
      return recipient?.global_name || recipient?.username || id;
    })
    .filter(Boolean) : [];

  useEffect(() => {
    if (typingNames.length > 0) {
      announceTyping(typingNames.join(', '));
    }
  }, [typingNames]);

  useEffect(() => {
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last && last.author.id !== currentUser?.id) {
        announceMessage(last.author.username, last.content || '');
      }
    }
  }, [messages.length]);

  useEffect(() => {
    if (channelTitle) {
      announceChannelChange(channelTitle);
    }
  }, [channelTitle]);

  if (!selectedChannelId || !channel) {
    return (
      <div className={styles.container} data-testid="chat-area">
        <div className={styles.emptyState}>{guild ? t('guild.no_guilds') : t('dm.empty')}</div>
      </div>
    );
  }

  if (isStage && guild) {
    return (
      <StageChannelView
        guild={guild}
        channel={channel}
      />
    );
  }

  if (isVoiceLike && guild) {
    return (
      <VoiceChannelView
        guild={guild}
        channel={channel}
        currentUserId={currentUser?.id}
        isConnected={voiceGuildId === guild.id && voiceChannelId === channel.id}
        isConnecting={voiceConnecting}
        error={voiceError}
        selfMute={selfMute}
        selfDeaf={selfDeaf}
        selfVideo={useVoiceStore((s) => s.selfVideo)}
        selfScreen={useVoiceStore((s) => s.selfScreen)}
        speakingUserIds={speakingUserIds}
        onJoin={() => joinVoiceChannel(guild.id, channel.id)}
        onLeave={leaveVoiceChannel}
        onToggleMute={toggleSelfMute}
        onToggleDeaf={toggleSelfDeaf}
        onToggleVideo={() => useVoiceStore.getState().toggleSelfVideo()}
        onToggleScreen={() => useVoiceStore.getState().toggleSelfScreen()}
      />
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {isDirectMessage && dmProfileUser ? (
          <button
            type="button"
            className={styles.headerAvatar}
            onClick={(event) => openProfile(event, dmProfileUser.id)}
            data-user-popout-trigger="true"
            aria-label={`Ouvrir le profil de ${channelTitle}`}
          >
            {dmProfileUser.avatar ? <img src={dmProfileUser.avatar} alt="" /> : channelTitle.slice(0, 1).toUpperCase()}
          </button>
        ) : isDirectMessage ? <MessageCircle size={20} className={styles.headerIcon} /> : <Hash size={20} className={styles.headerIcon} />}
        <span className={styles.headerName}>{channelTitle}</span>
        {headerTopic && <>
          <div className={styles.headerDivider} />
          <span className={styles.headerTopic}>{headerTopic}</span>
        </>}
        <div className={styles.headerActions}>
          {isForum && (
            <button className={styles.headerPillButton} onClick={() => void handleCreateForumPost()}>
              Nouveau post
            </button>
          )}
          {isThread && (
            <button className={styles.headerPillButton} onClick={() => void handleLeaveThread()}>
              Quitter
            </button>
          )}
          {isThread && canManageThreads && (
            <>
              <button className={styles.headerPillButton} onClick={() => void handleArchiveThread()}>
                Archiver
              </button>
              <button className={styles.headerPillButton} onClick={() => void handleLockThread()}>
                Verrouiller
              </button>
            </>
          )}
          {!isThread && !isDirectMessage && (channel?.type === 0 || channel?.type === 5) && (
            <Tooltip content="Fils" position="bottom" delay={300}>
              <button onClick={() => setSidePanel((current) => current === 'threads' ? null : 'threads')}>
                <MessageCircle size={20} />
              </button>
            </Tooltip>
          )}
          <Tooltip content={t('message.pinned')} position="bottom" delay={300}>
            <button onClick={() => setSidePanel((current) => current === 'pins' ? null : 'pins')}><Pin size={20} /></button>
          </Tooltip>
          {!isDirectMessage && (
            <Tooltip content={t('guild.members')} position="bottom" delay={300}>
              <button onClick={toggleMemberList}><Users size={20} /></button>
            </Tooltip>
          )}
          <Tooltip content={t('common.search')} position="bottom" delay={300}>
            <button onClick={() => setSidePanel((current) => current === 'search' ? null : 'search')}><Search size={20} /></button>
          </Tooltip>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.conversation}>
          <div className={styles.messages} ref={messagesContainerRef} onScroll={handleScroll}>
            <div className={styles.welcome}>
              <div className={styles.welcomeIcon}>{isDirectMessage ? channelTitle?.slice(0, 1).toUpperCase() : '#'}</div>
              <div className={styles.welcomeTitle}>{isDirectMessage ? t('dm.welcome_title', { user: channelTitle }) : t('channel.welcome_title', { channel: channel.name })}</div>
              <div className={styles.welcomeDesc}>
                {isDirectMessage ? t('dm.welcome', { user: channelTitle }) : t('channel.placeholder', { channel: channel.name })}
              </div>
            </div>

            <div role="list" aria-label="Messages" data-testid="message-list">
            {groupedMessages.map((group, groupIndex) => {
              const headerMessage = group[0]!;
              const isNewMessage = lastReadMessageId && headerMessage.id === lastReadMessageId;

              return (
                <>
                  {isNewMessage && (
                    <div className={styles.newMessagesSeparator} role="separator" aria-label="Nouveaux messages">
                      <div className={styles.separatorLine} />
                      <span className={styles.separatorText}>Nouveaux messages</span>
                      <div className={styles.separatorLine} />
                    </div>
                  )}
                  {headerMessage.type && headerMessage.type !== 0 && headerMessage.type !== 19 ? (
                    <SystemMessageRow key={headerMessage.id} msg={headerMessage} guild={guild} />
                  ) : (
                <div key={headerMessage.id} className={styles.messageGroup} role="listitem" aria-label={`Message de ${displayName}, ${format(new Date(headerMessage.created_at), 'dd/MM/yyyy HH:mm')}`} data-testid={`message-${headerMessage.id}`}>
                  <div className={styles.messageGroupHeader} onContextMenu={(e) => handleMessageContextMenu(e, headerMessage)}>
                    <button
                      type="button"
                      className={styles.avatar}
                      onClick={(event) => openProfile(event, headerMessage.author.id)}
                      data-user-popout-trigger="true"
                      data-testid={`message-avatar-${headerMessage.author.id}`}
                      aria-label={`Ouvrir le profil de ${displayName}`}
                    >
                      {headerMessage.author.avatar
                        ? <img src={headerMessage.author.avatar} alt="" />
                        : headerMessage.author.username.slice(0, 1).toUpperCase()
                      }
                    </button>
                    <div className={styles.messageBody}>
                      <div className={styles.messageMeta}>
                        <button
                          type="button"
                          className={styles.messageAuthor}
                          style={{ color: getMemberColor(headerMessage.author.id, guild) }}
                          onClick={(event) => openProfile(event, headerMessage.author.id)}
                          data-user-popout-trigger="true"
                          aria-label={`Ouvrir le profil de ${displayName}`}
                        >
                          {displayName}
                        </button>
                        <span className={styles.messageTimestamp}>
                          {format(new Date(headerMessage.created_at), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>
                      <MessageContent msg={headerMessage} editingId={editingId} editValue={editValue} setEditValue={setEditValue} onEditSubmit={handleEditSubmit} />
                      {headerMessage.attachments?.length > 0 && (
                        (() => {
                          const firstAttachment = headerMessage.attachments[0];
                          const restAttachments = headerMessage.attachments.slice(1);
                          return (
                            <div>
                              {firstAttachment && <Attachment key={firstAttachment.id} attachment={firstAttachment} />}
                              {restAttachments.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                  {restAttachments.map((attachment: any) => <Attachment key={attachment.id} attachment={attachment} compact />)}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                      {headerMessage.reactions?.length > 0 && <Reactions reactions={headerMessage.reactions} onReact={(emoji) => handleReaction(headerMessage.id, emoji)} />}
                    </div>
                    <MessageActions
                      msg={headerMessage}
                      userId={currentUser?.id}
                      onReply={() => setReplyTo(headerMessage)}
                      onDelete={() => selectedChannelId && deleteMessage(selectedChannelId, headerMessage.id)}
                      onReact={() => handleReaction(headerMessage.id, '👍')}
                      onRetry={() => selectedChannelId && retryMessage(selectedChannelId, headerMessage.id)}
                      onMore={(event) => setMsgCtxMenu({ msg: headerMessage, x: event.clientX, y: event.clientY })}
                    />
                  </div>

                  {group.slice(1).map((message) => (
                    <div key={message.id} className={styles.compactMessage} onContextMenu={(e) => handleMessageContextMenu(e, message)} role="listitem" aria-label={`Message de ${message.author?.username || 'utilisateur'}, ${format(new Date(message.created_at), 'HH:mm')}`} data-testid={`message-${message.id}`}>
                      <span className={styles.compactTimestamp}>{format(new Date(message.created_at), 'HH:mm')}</span>
                      <MessageContent msg={message} editingId={editingId} editValue={editValue} setEditValue={setEditValue} onEditSubmit={handleEditSubmit} />
                      {message.attachments?.length > 0 && (
                        (() => {
                          const firstAttachment = message.attachments[0];
                          const restAttachments = message.attachments.slice(1);
                          return (
                            <div>
                              {firstAttachment && <Attachment key={firstAttachment.id} attachment={firstAttachment} />}
                              {restAttachments.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                  {restAttachments.map((attachment: any) => <Attachment key={attachment.id} attachment={attachment} compact />)}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                      {message.reactions?.length > 0 && <Reactions reactions={message.reactions} onReact={(emoji) => handleReaction(message.id, emoji)} />}
                      <MessageActions
                        msg={message}
                        userId={currentUser?.id}
                        onReply={() => setReplyTo(message)}
                        onDelete={() => selectedChannelId && deleteMessage(selectedChannelId, message.id)}
                        onReact={() => handleReaction(message.id, '👍')}
                        onRetry={() => selectedChannelId && retryMessage(selectedChannelId, message.id)}
                        onMore={(event) => setMsgCtxMenu({ msg: message, x: event.clientX, y: event.clientY })}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
            </div>
            <div ref={messagesEndRef} />
          </div>

          {typingNames.length > 0 && (
            <div className={styles.typingIndicator}>
              <div className={styles.typingDots}>
                <div className={styles.typingDot} />
                <div className={styles.typingDot} />
                <div className={styles.typingDot} />
              </div>
              <strong>{typingNames.join(', ')}</strong>&nbsp;{typingNames.length === 1 ? t('chat.typing_one', { user: typingNames[0] }) : t('chat.typing_other', { users: typingNames.join(', ') })}
            </div>
          )}

          {replyTo && (
            <div className={styles.replyBar}>
              <Reply size={14} />
              <span>Réponse à <strong>{replyTo.author.username}</strong></span>
              <button onClick={() => setReplyTo(null)}><X size={14} /></button>
            </div>
          )}

          {isForum ? (
            <div className={styles.forumComposer}>
              <div className={styles.sidePanelEmpty}>Les salons forum publient des posts sous forme de fils.</div>
              <button className={styles.searchButton} onClick={() => void handleCreateForumPost()}>
                Créer un post
              </button>
            </div>
          ) : (
            <div className={styles.inputArea}>
              <div className={styles.inputWrapper}>
                <Tooltip content="Joindre des fichiers" position="top" delay={300}>
                  <button onClick={() => fileInputRef.current?.click()}><PlusCircle size={20} /></button>
                </Tooltip>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple onChange={handleFileUpload} />
                <textarea
                  ref={textareaRef}
                  className={styles.textInput}
                  placeholder={messagePlaceholder}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  role="textbox"
                  aria-label={`Message ${channelTitle}`}
                  aria-multiline="true"
                  data-testid="message-input"
                />
                <Tooltip content="Choisir un emoji" position="top" delay={300}>
                  <button ref={emojiButtonRef} onClick={() => setShowEmojiPicker((v) => !v)}><Smile size={20} /></button>
                </Tooltip>
              </div>
              {showSlashAutocomplete && selectedChannelId && (
                <SlashCommandAutocomplete
                  channelId={selectedChannelId}
                  guildId={guild?.id}
                  inputValue={inputValue}
                  onSelect={(commandText, commandId) => {
                    setInputValue(commandText);
                    if (commandId) setPendingSlashCommandId(commandId);
                    setShowSlashAutocomplete(false);
                  }}
                  onClose={() => setShowSlashAutocomplete(false)}
                  anchorRef={textareaRef as React.RefObject<HTMLElement>}
                />
              )}
            </div>
          )}
        </div>

        {isDirectMessage && dmProfileUser && !sidePanel && (
          <DMProfilePanel
            user={dmProfileUser}
            channel={channel}
            onOpenProfile={(event) => openProfile(event, dmProfileUser.id)}
          />
        )}

        {sidePanel && (
          <aside className={styles.sidePanel}>
            <div className={styles.sidePanelHeader}>
              <div className={styles.sidePanelTitle}>
                {sidePanel === 'pins' ? t('message.pinned') : sidePanel === 'threads' ? 'Fils' : t('message.search')}
              </div>
              <button className={styles.sidePanelClose} onClick={() => setSidePanel(null)}><X size={18} /></button>
            </div>
            <div className={styles.sidePanelBody}>
              {sidePanel === 'pins' ? (
                pinsLoading ? (
                  <div className={styles.sidePanelEmpty}>Chargement…</div>
                ) : pinnedMessages.length === 0 ? (
                  <div className={styles.sidePanelEmpty}>Aucun message épinglé dans ce salon.</div>
                ) : (
                  pinnedMessages.map((message) => (
                    <button key={message.id} className={styles.sidePanelCard} onClick={() => setSidePanel(null)}>
                      <div className={styles.sidePanelMeta}>
                        <strong>{message.author?.global_name || message.author?.username}</strong>
                        <span>{format(new Date(message.created_at), 'dd/MM HH:mm')}</span>
                      </div>
                      <div className={styles.sidePanelContent}>{message.content || 'Pièce jointe / contenu enrichi'}</div>
                    </button>
                  ))
                )
              ) : sidePanel === 'threads' ? (
                <ThreadsPanel
                  channelId={selectedChannelId}
                  guild={guild}
                  onSelectThread={(threadId) => { selectChannel(threadId); setSidePanel(null); }}
                />
              ) : (
                <>
                  <div className={styles.searchForm}>
                    <input
                      className={styles.searchInput}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
                      placeholder={guild ? 'Rechercher dans ce serveur…' : 'Rechercher dans cette conversation…'}
                    />
                    <button className={styles.searchButton} onClick={() => void handleSearch()} disabled={searchLoading || !searchQuery.trim()}>
                      {searchLoading ? '…' : 'Chercher'}
                    </button>
                  </div>
                  {searchSummary && <div className={styles.searchSummary}>{searchSummary}</div>}
                  {searchResults.length === 0 ? (
                    <div className={styles.sidePanelEmpty}>
                      {searchQuery.trim() ? 'Aucun résultat.' : 'Lancez une recherche pour afficher les messages correspondants.'}
                    </div>
                  ) : (
                    searchResults.map((result) => (
                      <button key={`${result.channel_id}:${result.id}`} className={styles.sidePanelCard} onClick={() => openSearchResult(result)}>
                        <div className={styles.sidePanelMeta}>
                          <strong>{result.author?.global_name || result.author?.username}</strong>
                          <span>{guild ? `#${result._channelName}` : result._channelName}</span>
                        </div>
                        <div className={styles.sidePanelContent}>{result.content || 'Pièce jointe / contenu enrichi'}</div>
                        <div className={styles.sidePanelDate}>{format(new Date(result.created_at), 'dd/MM/yyyy HH:mm')}</div>
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      {showEmojiPicker && (
        <EmojiPicker
          anchorRef={emojiButtonRef}
          onSelect={(emoji) => { setInputValue((v) => v + emoji); setShowEmojiPicker(false); }}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
      {msgCtxMenu && selectedChannelId && (
        <MessageContextMenu
          message={msgCtxMenu.msg}
          channelId={selectedChannelId}
          guildId={guild?.id}
          position={{ x: msgCtxMenu.x, y: msgCtxMenu.y }}
          onClose={() => setMsgCtxMenu(null)}
          onReply={() => setReplyTo(msgCtxMenu.msg)}
          onAddReaction={() => { setShowEmojiPicker(true); setMsgCtxMenu(null); }}
          onEdit={(id, content) => { setEditingId(id); setEditValue(content); setMsgCtxMenu(null); }}
          onStartThread={guild && channel?.type === 0 ? handleStartThreadFromMessage : undefined}
        />
      )}
    </div>
  );
}

function VoiceChannelView({
  guild,
  channel,
  currentUserId,
  isConnected,
  isConnecting,
  error,
  selfMute,
  selfDeaf,
  selfVideo,
  selfScreen,
  speakingUserIds,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeaf,
  onToggleVideo,
  onToggleScreen,
}: {
  guild: any;
  channel: any;
  currentUserId?: string;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  selfScreen: boolean;
  speakingUserIds: Set<string>;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeaf: () => void;
  onToggleVideo: () => void;
  onToggleScreen: () => void;
}) {
  const voiceStates = useGuildStore((s) => s.voiceStates);
  const states = (voiceStates.get(guild.id) || []).filter((state: any) => state.channel_id === channel.id);
  const participants = states.map((state: any) => {
    const member = guild.members?.find((item: any) => item.user.id === state.user_id);
    return {
      state,
      user: member?.user || { id: state.user_id, username: 'Utilisateur', avatar: null },
      displayName: member?.nickname || member?.user.global_name || member?.user.username || 'Utilisateur',
    };
  });
  const connectedCount = participants.length;
  const userLimit = channel.user_limit || 0;

  if (isConnected) {
    return (
      <div className={styles.container} data-testid="voice-channel-view">
        <VoiceVideo />
        <div className={styles.voiceParticipantGrid}>
          {participants.length === 0 ? (
            <div className={styles.voiceEmpty}>Aucun participant connecté.</div>
          ) : participants.map(({ state, user, displayName }: any) => {
            const speaking = speakingUserIds.has(user.id);
            return (
              <div key={user.id} className={`${styles.voiceParticipant} ${speaking ? styles.voiceParticipantSpeaking : ''}`}>
                <div className={styles.voiceParticipantAvatar}>
                  {user.avatar ? <img src={user.avatar} alt="" /> : displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className={styles.voiceParticipantInfo}>
                  <div className={styles.voiceParticipantName}>
                    {displayName}{user.id === currentUserId ? ' (vous)' : ''}
                  </div>
                  <div className={styles.voiceParticipantState}>
                    {(state.self_mute || state.mute) && <span><MicOff size={12} /> Muet</span>}
                    {(state.self_deaf || state.deaf) && <span><Headphones size={12} /> Sourd</span>}
                    {!state.self_mute && !state.mute && !state.self_deaf && !state.deaf && <span>Disponible</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} data-testid="voice-channel-view">
      <div className={styles.header}>
        <Volume2 size={20} className={styles.headerIcon} />
        <span className={styles.headerName}>{channel.name}</span>
        <div className={styles.headerDivider} />
        <span className={styles.headerTopic}>
          {connectedCount}{userLimit > 0 ? `/${userLimit}` : ''} connecté{connectedCount > 1 ? 's' : ''}
        </span>
      </div>
      <div className={styles.voiceStage}>
        <div className={styles.voiceHero}>
          <div className={styles.voiceHeroIcon}><Volume2 size={36} /></div>
          <div>
            <div className={styles.voiceHeroTitle}>{channel.name}</div>
            <div className={styles.voiceHeroMeta}>
              {isConnected ? 'Connecté au vocal' : isConnecting ? 'Connexion en cours…' : 'Salon vocal'}
            </div>
          </div>
          <div className={styles.voiceHeroActions}>
            {isConnected ? (
              <>
                <button className={styles.headerPillButton} onClick={onToggleMute} aria-pressed={selfMute}>
                  {selfMute ? <MicOff size={16} /> : <Mic size={16} />}
                  {selfMute ? 'Muet' : 'Micro'}
                </button>
                <button className={styles.headerPillButton} onClick={onToggleDeaf} aria-pressed={selfDeaf}>
                  <Headphones size={16} />
                  {selfDeaf ? 'Sourd' : 'Casque'}
                </button>
                <button className={`${styles.headerPillButton} ${selfVideo ? styles.activeButton : ''}`} onClick={onToggleVideo}>
                  <Video size={16} />
                  {selfVideo ? 'Caméra' : 'Vidéo'}
                </button>
                <button className={`${styles.headerPillButton} ${selfScreen ? styles.activeButton : ''}`} onClick={onToggleScreen}>
                  <Monitor size={16} />
                  {selfScreen ? 'Partage' : 'Écran'}
                </button>
                <button className={styles.headerPillButton} onClick={onLeave}>
                  <PhoneOff size={16} />
                  Quitter
                </button>
              </>
            ) : (
              <button className={styles.headerPillButton} onClick={onJoin} disabled={isConnecting}>
                {isConnecting ? 'Connexion…' : 'Rejoindre'}
              </button>
            )}
          </div>
        </div>

        {error && <div className={styles.voiceError}>{error}</div>}

        <div className={styles.voiceParticipantGrid}>
          {participants.length === 0 ? (
            <div className={styles.voiceEmpty}>Aucun participant connecté.</div>
          ) : participants.map(({ state, user, displayName }: any) => {
            const speaking = speakingUserIds.has(user.id);
            return (
              <div key={user.id} className={`${styles.voiceParticipant} ${speaking ? styles.voiceParticipantSpeaking : ''}`}>
                <div className={styles.voiceParticipantAvatar}>
                  {user.avatar ? <img src={user.avatar} alt="" /> : displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className={styles.voiceParticipantInfo}>
                  <div className={styles.voiceParticipantName}>
                    {displayName}{user.id === currentUserId ? ' (vous)' : ''}
                  </div>
                  <div className={styles.voiceParticipantState}>
                    {(state.self_mute || state.mute) && <span><MicOff size={12} /> Muet</span>}
                    {(state.self_deaf || state.deaf) && <span><Headphones size={12} /> Sourd</span>}
                    {!state.self_mute && !state.mute && !state.self_deaf && !state.deaf && <span>Disponible</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DMProfilePanel({ user, channel, onOpenProfile }: { user: any; channel: any; onOpenProfile: (event: MouseEvent<HTMLElement>) => void }) {
  const displayName = user.global_name || user.username || 'Utilisateur';
  const memberSince = user.created_at ? format(new Date(user.created_at), 'dd/MM/yyyy') : null;
  const participantCount = channel.recipients?.length || 1;

  return (
    <aside className={styles.dmProfilePanel} data-testid="dm-profile-panel">
      <div
        className={styles.dmProfileBanner}
        style={user.banner
          ? { backgroundImage: `url(${user.banner})` }
          : user.banner_color
            ? { background: user.banner_color }
            : undefined}
      />
      <button
        type="button"
        className={styles.dmProfileAvatar}
        onClick={onOpenProfile}
        data-user-popout-trigger="true"
        aria-label={`Ouvrir le profil de ${displayName}`}
      >
        {user.avatar ? <img src={user.avatar} alt="" /> : displayName.slice(0, 1).toUpperCase()}
        <span className={`${styles.dmProfileStatus} ${getStatusClassForChat(user.status, styles)}`} />
      </button>
      <div className={styles.dmProfileBody}>
        <div className={styles.dmProfileName}>{displayName}</div>
        <div className={styles.dmProfileTag}>{user.username}#{user.discriminator}</div>
        {(user.custom_status_text || user.custom_status_emoji) && (
          <div className={styles.dmProfileStatusText}>
            {user.custom_status_emoji && <span>{user.custom_status_emoji}</span>}
            <span>{user.custom_status_text || user.status}</span>
          </div>
        )}
        {user.bio && <div className={styles.dmProfileBio}>{user.bio}</div>}
        <div className={styles.dmProfileSection}>
          <div className={styles.dmProfileSectionTitle}>Conversation</div>
          <div className={styles.dmProfileSectionValue}>
            {participantCount > 1 ? `${participantCount} participants` : 'Message privé'}
          </div>
        </div>
        {memberSince && (
          <div className={styles.dmProfileSection}>
            <div className={styles.dmProfileSectionTitle}>Membre depuis</div>
            <div className={styles.dmProfileSectionValue}>{memberSince}</div>
          </div>
        )}
      </div>
    </aside>
  );
}

function MessageContent({ msg, editingId, editValue, setEditValue, onEditSubmit }: any) {
  const { t } = useTranslation();
  if (editingId === msg.id) {
    return (
      <textarea
        className={styles.textInput}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={onEditSubmit}
        autoFocus
        style={{ background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: '4px' }}
      />
    );
  }

  const contentHtml = msg.content ? md.render(msg.content) : '';
  const editedHtml = msg.edited_at ? `<span class="${styles.messageEdited}">(modifié)</span>` : '';
  const failedHtml = msg.pending && msg.failed
    ? ` <span class="${styles.messageFailed}">${t('chat.message_failed')}${msg.error ? `: ${msg.error}` : ''}</span>`
    : '';

  // Check if message is forwarded (FORWARDED flag = 1 << 13 = 8192)
  const isForwarded = (Number(msg.flags) & 8192) !== 0;
  const forwardedHeader = isForwarded
    ? `<div class="${styles.forwardedHeader}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2v12h12V2H2zm1 1h10v10H3V3z"/><path d="M6 7l3-3v2h2v2h-2v2l-3-3z"/></svg> Message transféré</div>`
    : '';

  // Check if message is crossposted (IS_CROSSPOST flag = 1 << 1 = 2)
  const isCrosspost = (Number(msg.flags) & 2) !== 0;
  const crosspostHeader = isCrosspost
    ? `<div class="${styles.crosspostHeader}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 3l-7 7-3-3 1.5-1.5L6.5 8l5.5 5.5L15 4.5z"/></svg> ${t('chat.crosspost')}</div>`
    : '';

  // Render forwarded message snapshots if available
  let snapshotsHtml = '';
  if (isForwarded && msg.message_snapshots) {
    try {
      const snapshots = Array.isArray(msg.message_snapshots) ? msg.message_snapshots : JSON.parse(msg.message_snapshots);
      if (snapshots.length > 0) {
        const snap = snapshots[0].message;
        const snapAuthor = snap.author || {};
        const snapContent = snap.content ? md.render(snap.content) : '';
        snapshotsHtml = `
          <div class="${styles.forwardedSnapshot}">
            <div class="${styles.forwardedSnapshotAuthor}">
              <strong>${snapAuthor.global_name || snapAuthor.username || 'Utilisateur'}</strong>
              <span class="${styles.forwardedSnapshotTime}">${new Date(snap.created_at).toLocaleDateString()}</span>
            </div>
            <div class="${styles.forwardedSnapshotContent}">${snapContent}</div>
          </div>
        `;
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  return (
    <div>
      <div
        className={`${styles.messageContent} ${msg.pending ? styles.messagePending : ''}`}
        dangerouslySetInnerHTML={{ __html: forwardedHeader + crosspostHeader + snapshotsHtml + contentHtml + editedHtml + failedHtml }}
      />
      {msg.components && <MessageComponents components={msg.components} />}
    </div>
  );
}

import { MessageComponents } from '../MessageComponents/MessageComponents';

function Attachment({ attachment, compact }: { attachment: any; compact?: boolean }) {
  const isImage = attachment.mime_type?.startsWith('image/');
  if (isImage) {
    return (
      <img
        src={attachment.url}
        alt={attachment.filename}
        className={styles.attachmentImage}
        style={compact ? { maxWidth: 120, maxHeight: 120 } : {}}
      />
    );
  }
  return (
    <a href={attachment.url} className={styles.attachmentFile} download>
      {attachment.filename} ({Math.round(attachment.size / 1024)}KB)
    </a>
  );
}

function Reactions({ reactions, onReact }: { reactions: any[]; onReact: (emoji: string) => void }) {
  return (
    <div className={styles.reactions}>
      {reactions.map((reaction: any, index: number) => (
        <button
          key={index}
          className={`${styles.reaction} ${reaction.me_burst ? styles.reactionBurst : ''}`}
          onClick={() => onReact(reaction.emoji_name)}
          title={reaction.burst_count > 0 ? `Super réaction (${reaction.burst_count})` : `Réaction (${reaction.count || 1})`}
        >
          {reaction.emoji_name}
          {reaction.burst_count > 0 ? (
            <span className={`${styles.reactionCount} ${styles.burstCount}`}>{reaction.burst_count}</span>
          ) : (
            <span className={styles.reactionCount}>{reaction.count || 1}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function MessageActions({
  msg,
  userId,
  onReply,
  onDelete,
  onReact,
  onRetry,
  onMore,
}: {
  msg: any;
  userId?: string;
  onReply: () => void;
  onDelete: () => void;
  onReact: () => void;
  onRetry: () => void;
  onMore: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className={styles.actions}>
      <Tooltip content="Réagir" position="top" delay={300}>
        <button onClick={onReact}><Smile size={16} /></button>
      </Tooltip>
      <Tooltip content="Répondre" position="top" delay={300}>
        <button onClick={onReply}><Reply size={16} /></button>
      </Tooltip>
      {msg.pending && msg.failed && (
        <Tooltip content="Réessayer" position="top" delay={300}>
          <button onClick={onRetry}><MessageCircle size={16} /></button>
        </Tooltip>
      )}
      {msg.author.id === userId && (
        <Tooltip content="Supprimer" position="top" delay={300}>
          <button onClick={onDelete}><Trash2 size={16} /></button>
        </Tooltip>
      )}
      <Tooltip content="Plus" position="top" delay={300}>
        <button onClick={onMore}><MoreHorizontal size={16} /></button>
      </Tooltip>
    </div>
  );
}

function SystemMessageRow({ msg, guild }: { msg: any; guild: any }) {
  const isDeferredInteractionPlaceholder =
    msg.type === 4 &&
    (Number(msg.flags || 0) & 64) !== 0 &&
    !msg.content;

  const getIcon = () => {
    switch (msg.type) {
      case 7: return <UserPlus size={16} />;
      case 8: return <Zap size={16} />;
      case 6: return <Info size={16} />;
      default: return <Info size={16} />;
    }
  };

  const getContent = () => {
    const name = msg.author
      ? getMessageDisplayName(msg.author.id, msg.author, guild)
      : 'Quelqu\'un';
    switch (msg.type) {
      case 7: return <><strong>{name}</strong> a rejoint le serveur. Bienvenue !</>;
      case 8: return <><strong>{name}</strong> a boosté le serveur. 🚀</>;
      default: return msg.content || (isDeferredInteractionPlaceholder ? 'Le bot repond...' : 'Message systeme.');
    }
  };

  return (
    <div className={styles.systemMessage}>
      <span className={styles.systemMessageIcon}>{getIcon()}</span>
      <span className={styles.systemMessageContent}>
        {getContent()}
        {msg.components && <MessageComponents components={msg.components} />}
      </span>
      <span className={styles.systemMessageTime}>{format(new Date(msg.created_at), 'HH:mm')}</span>
    </div>
  );
}

function isSystemMessage(msg: any): boolean {
  return msg.type !== undefined && msg.type !== 0 && msg.type !== 19;
}

function groupMessages(messages: any[]): any[][] {
  const groups: any[][] = [];
  for (const message of messages) {
    if (isSystemMessage(message)) {
      groups.push([message]);
      continue;
    }
    const lastGroup = groups[groups.length - 1];
    if (lastGroup) {
      const lastMessage = lastGroup[lastGroup.length - 1];
      if (isSystemMessage(lastMessage)) {
        groups.push([message]);
        continue;
      }
      const sameAuthor = lastMessage.author.id === message.author.id;
      const timeDiff = new Date(message.created_at).getTime() - new Date(lastMessage.created_at).getTime();
      if (sameAuthor && timeDiff < 7 * 60 * 1000) {
        lastGroup.push(message);
        continue;
      }
    }
    groups.push([message]);
  }
  return groups;
}

function getMemberColor(userId: string, guild: any): string {
  if (!guild) return 'var(--text-primary)';
  const member = guild.members?.find((item: any) => item.user.id === userId);
  if (!member || !member.roles?.length) return 'var(--text-primary)';
  for (const roleId of [...member.roles].reverse()) {
    const role = guild.roles?.find((item: any) => item.id === roleId);
    if (role?.color) return role.color;
  }
  return 'var(--text-primary)';
}

function getMessageDisplayName(userId: string, author: any, guild: any): string {
  if (!guild) return author.global_name || author.username;
  const member = guild.members?.find((item: any) => item.user.id === userId);
  return member?.nickname || member?.user.global_name || author.global_name || author.username;
}

function getConversationTitle(channel: any, currentUserId?: string): string {
  if (channel.name) return channel.name;
  const recipients = (channel.recipients || []).filter((recipient: any) => recipient.id !== currentUserId);
  if (recipients.length === 0) return 'Conversation';
  if (recipients.length === 1) {
    return recipients[0].global_name || recipients[0].username;
  }
  return recipients.map((recipient: any) => recipient.global_name || recipient.username).join(', ');
}

function getConversationSubtitle(channel: any): string | null {
  const recipients = channel.recipients || [];
  if (recipients.length === 0) return null;
  if (recipients.length === 1) {
    return recipients[0].custom_status_text || recipients[0].status || null;
  }
  return `${recipients.length} participants`;
}

function getStatusClassForChat(status: string, css: Record<string, string>): string {
  if (status === 'online') return css.dmProfileStatusOnline || '';
  if (status === 'idle') return css.dmProfileStatusIdle || '';
  if (status === 'dnd') return css.dmProfileStatusDnd || '';
  return css.dmProfileStatusOffline || '';
}

function isVoiceLikeChannel(channel: any): boolean {
  return channel.type === 2 || channel.type === 13 || channel.type === 14;
}

function isMessageLikeChannel(channel: any): boolean {
  return !isVoiceLikeChannel(channel);
}

function hasGuildPermission(guild: any, userId: string, bit: bigint): boolean {
  if (!guild || !userId) return false;
  if (guild.owner_id === userId) return true;
  const member = guild.members?.find((item: any) => item.user.id === userId);
  if (!member) return false;
  for (const roleId of member.roles || []) {
    const role = guild.roles?.find((item: any) => item.id === roleId);
    if (!role) continue;
    try {
      const perms = BigInt(role.permissions);
      if ((perms & BigInt(0x8)) !== BigInt(0)) return true;
      if ((perms & bit) !== BigInt(0)) return true;
    } catch {
      continue;
    }
  }
  return false;
}
