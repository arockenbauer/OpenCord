import type { MouseEvent } from 'react';
import { Home, Plus, LogOut, Settings, Trash2, UserPlus, ShieldAlert, Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useUnreadStore } from '../../stores/unreadStore';
import styles from './ServerList.module.css';

export function ServerList() {
  const navigate = useNavigate();
  const guilds = useGuildStore((s) => s.guilds);
  const selectedGuildId = useGuildStore((s) => s.selectedGuildId);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const setShowCreateGuild = useUIStore((s) => s.setShowCreateGuild);
  const setShowInviteModal = useUIStore((s) => s.setShowInviteModal);
  const setShowServerSettings = useUIStore((s) => s.setShowServerSettings);
  const setActiveServerSettingsTab = useUIStore((s) => s.setActiveServerSettingsTab);
  const setModalData = useUIStore((s) => s.setModalData);
  const setContextMenu = useUIStore((s) => s.setContextMenu);
  const currentUser = useAuthStore((s) => s.user);
  const channelUnreads = useUnreadStore((s) => s.channelUnreads);

  const openServerMenu = (event: MouseEvent, guild: any) => {
    event.preventDefault();
    selectGuild(guild.id);
    const isOwner = guild.owner_id === currentUser?.id;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: 'Inviter des personnes',
          icon: <UserPlus size={16} />,
          onClick: () => {
            const firstTextChannel = guild.channels.find((channel: any) => channel.type === 0 || channel.type === 5);
            setModalData({ guildId: guild.id, channelId: firstTextChannel?.id || '' });
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

  return (
    <nav className={styles.container} aria-label="Servers">
      <div
        className={`${styles.homeButton} ${!selectedGuildId ? styles.active : ''}`}
        onClick={() => selectGuild(null)}
        role="button"
        tabIndex={0}
        aria-label="Home"
        data-testid="server-list-home"
      >
        <Home size={24} />
      </div>

      <div
        className={styles.homeButton}
        onClick={() => navigate('/discover')}
        title="Découverte"
        role="button"
        tabIndex={0}
        aria-label="Explorer les serveurs publics"
        data-testid="server-list-discovery"
      >
        <Compass size={22} />
      </div>

      <div className={styles.separator} />

      {Array.from(guilds.values()).map((guild) => {
        const hasUnread = guild.channels.some(
          (ch) => channelUnreads[ch.id]?.hasUnread,
        );
        const mentionCount = guild.channels.reduce(
          (acc: number, ch) => acc + (channelUnreads[ch.id]?.mentionCount || 0),
          0
        );
        const isSelected = selectedGuildId === guild.id;
        const isOwner = guild.owner_id === currentUser?.id;
        const hasAdmin = guild.roles?.some((r: any) =>
          currentUser && r.permissions && (BigInt(r.permissions) & BigInt(0x8)) !== BigInt(0)
        );
        const boostLevel = guild.premium_tier || 0;
        const verificationLevel = guild.verification_level || 0;

        return (
          <div
            key={guild.id}
            className={`${styles.serverIcon} ${isSelected ? styles.active : ''}`}
            onClick={() => selectGuild(guild.id)}
            onContextMenu={(event) => openServerMenu(event, guild)}
            title={guild.name}
            role="button"
            tabIndex={0}
            aria-label={`${guild.name}${mentionCount > 0 ? ` (${mentionCount} mentions)` : ''}`}
            data-testid={`guild-icon-${guild.id}`}
          >
            {isSelected && <div className={`${styles.indicator} ${styles.active}`} />}
            {!isSelected && mentionCount > 0 && (
              <div className={`${styles.indicator} ${styles.mentions}`}>
                <span className={styles.mentionCount}>{mentionCount > 99 ? '99+' : mentionCount}</span>
              </div>
            )}
            {!isSelected && !mentionCount && hasUnread && <div className={`${styles.indicator} ${styles.unread}`} />}

            {guild.icon ? <img src={guild.icon} alt={`${guild.name}'s icon`} /> : guild.name.slice(0, 2).toUpperCase()}
          </div>
        );
      })}

      {currentUser && currentUser.admin_level >= 1 && (
        <div
          className={styles.adminButton}
          onClick={() => navigate('/admin')}
          title="Panel Admin"
          role="button"
          tabIndex={0}
          aria-label="Panel Admin"
          data-testid="server-list-admin"
        >
          <ShieldAlert size={22} />
        </div>
      )}

      <div
        className={styles.addButton}
        onClick={() => setShowCreateGuild(true)}
        role="button"
        tabIndex={0}
        aria-label="Ajouter un serveur"
        data-testid="server-list-create"
      >
        <Plus size={24} />
      </div>
    </nav>
  );
}
