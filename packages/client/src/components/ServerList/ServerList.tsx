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
  const setShowServerSettings = useUIStore((s) => s.setShowServerSettings);
  const setActiveServerSettingsTab = useUIStore((s) => s.setActiveServerSettingsTab);
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
            setActiveServerSettingsTab('invites');
            setShowServerSettings(true);
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
        const isSelected = selectedGuildId === guild.id;
        return (
          <div
            key={guild.id}
            className={`${styles.serverIcon} ${isSelected ? styles.active : ''}`}
            onClick={() => selectGuild(guild.id)}
            onContextMenu={(event) => openServerMenu(event, guild)}
            title={guild.name}
            role="button"
            tabIndex={0}
            aria-label={guild.name}
            data-testid={`guild-icon-${guild.id}`}
          >
            {isSelected && <div className={`${styles.indicator} ${styles.active}`} />}
            {!isSelected && hasUnread && <div className={`${styles.indicator} ${styles.unread}`} />}
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
