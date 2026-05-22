import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, AtSign, UserMinus, Ban, Clock, Copy, ChevronRight, UserCog, UserPlus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import type { DMChannel } from '../../stores/guildStore';
import { api } from '../../services/api';
import styles from './ContextMenu.module.css';

interface GuildMember {
  user: { id: string; username: string; discriminator: string; avatar: string | null };
  nickname: string | null;
  roles: string[];
  joined_at: string;
  [key: string]: any;
}

interface MemberContextMenuProps {
  member: GuildMember;
  guildId: string;
  position: { x: number; y: number };
  onClose: () => void;
  onViewProfile?: () => void;
}

function hasPermission(guildId: string, userId: string, bit: bigint): boolean {
  const guild = useGuildStore.getState().guilds.get(guildId);
  if (!guild) return false;
  if (guild.owner_id === userId) return true;
  const member = guild.members?.find((m: any) => m.user.id === userId);
  if (!member) return false;
  for (const roleId of member.roles) {
    const role = guild.roles?.find((r: any) => r.id === roleId);
    if (role) {
      try {
        const perms = BigInt(role.permissions);
        if ((perms & BigInt(8)) !== BigInt(0)) return true;
        if ((perms & bit) !== BigInt(0)) return true;
      } catch { /* skip */ }
    }
  }
  return false;
}

export function MemberContextMenu({ member, guildId, position, onClose, onViewProfile }: MemberContextMenuProps) {
  const currentUser = useAuthStore((s) => s.user);
  const addDMChannel = useGuildStore((s) => s.addDMChannel);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const selectChannel = useGuildStore((s) => s.selectChannel);
  const updateMember = useGuildStore((s) => s.updateMember);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showRoles, setShowRoles] = useState(false);
  const [showTimeout, setShowTimeout] = useState(false);
  const [timeoutDuration, setTimeoutDuration] = useState('300');

  const guild = useGuildStore((s) => s.guilds.get(guildId));
  const isSelf = currentUser?.id === member.user.id;
  const canManageNicknames = isSelf || hasPermission(guildId, currentUser?.id || '', BigInt(0x8000000));
  const canModerate = hasPermission(guildId, currentUser?.id || '', BigInt(0x10000000000));
  const canKick = hasPermission(guildId, currentUser?.id || '', BigInt(2));
  const canBan = hasPermission(guildId, currentUser?.id || '', BigInt(4));
  const canManageRoles = hasPermission(guildId, currentUser?.id || '', BigInt(268435456));
  const hasAdminActions = canManageNicknames || canModerate || canKick || canBan;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const adjustedPos = (() => {
    const menuW = 230;
    const menuH = 380;
    return {
      left: Math.min(position.x, window.innerWidth - menuW - 8),
      top: Math.min(position.y, window.innerHeight - menuH - 8),
    };
  })();

  const displayName = member.nickname || (member.user as any).global_name || (member.user.username ?? '');

  const handleOpenDM = async () => {
    onClose();
    try {
      const channel = await api.users.createDM<DMChannel>(member.user.id);
      addDMChannel(channel);
      selectGuild(null);
      selectChannel(channel.id);
    } catch { /* handled */ }
  };

  const handleMention = () => {
    window.dispatchEvent(new CustomEvent('insertMention', { detail: `<@${member.user.id}>` }));
    onClose();
  };

  const handleInviteToServer = async () => {
    const targetGuild = guild;
    if (!targetGuild) return;
    const inviteChannel = targetGuild.channels?.find((channel: any) => channel.type === 0 || channel.type === 5);
    if (!inviteChannel) return;
    onClose();
    try {
      const invite = await api<any>(`/api/guilds/${guildId}/channels/${inviteChannel.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({
          max_age: 604800,
          max_uses: 0,
          temporary: false,
          unique: false,
          source: 'context_menu',
        }),
      });
      const inviteUrl = `${window.location.origin}/invite/${invite.code}`;
      const channel = await api.users.createDM<DMChannel>(member.user.id);
      addDMChannel(channel);
      await api.dm.createMessage(channel.id, { content: inviteUrl });
      selectGuild(null);
      selectChannel(channel.id);
    } catch {
      /* Server permissions or DM privacy handle the failure. */
    }
  };

  const handleKick = async () => {
    if (!confirm(`Expulser ${displayName} ?`)) return;
    onClose();
    try {
      await api.guilds.kickMember(guildId, member.user.id);
    } catch { /* handled */ }
  };

  const handleBan = async () => {
    if (!confirm(`Bannir ${displayName} ?`)) return;
    onClose();
    try {
      await api.guilds.banMember(guildId, member.user.id);
    } catch { /* handled */ }
  };

  const handleTimeout = async () => {
    const until = new Date(Date.now() + parseInt(timeoutDuration) * 1000).toISOString();
    try {
      await api.guilds.updateMember(guildId, member.user.id, { communication_disabled_until: until });
      onClose();
    } catch { /* handled */ }
  };

  const handleRoleToggle = async (roleId: string) => {
    const haRole = member.roles.includes(roleId);
    try {
      if (haRole) {
        await api.guilds.removeRole(guildId, member.user.id, roleId);
        updateMember(guildId, { ...member, roles: member.roles.filter((r) => r !== roleId) } as any);
      } else {
        await api.guilds.addRole(guildId, member.user.id, roleId);
        updateMember(guildId, { ...member, roles: [...member.roles, roleId] } as any);
      }
    } catch { /* handled */ }
  };

  const assignableRoles = (guild?.roles || []).filter((r: any) => r.name !== '@everyone');

  return createPortal(
    <div className={styles.menu} ref={menuRef} style={{ position: 'fixed', left: adjustedPos.left, top: adjustedPos.top, zIndex: 1400 }}>
      {onViewProfile && (
        <button className={styles.item} onClick={() => { onViewProfile(); onClose(); }}>
          <UserCog size={16} />
          Voir le profil
        </button>
      )}
      {!isSelf && (
        <button className={styles.item} onClick={handleOpenDM}>
          <MessageCircle size={16} />
          Envoyer un message
        </button>
      )}
      {!isSelf && guild && (
        <button className={styles.item} onClick={handleInviteToServer}>
          <UserPlus size={16} />
          Inviter au serveur
        </button>
      )}
      <button className={styles.item} onClick={handleMention}>
        <AtSign size={16} />
        Mentionner
      </button>

      <button className={styles.item} onClick={() => { navigator.clipboard.writeText(member.user.id); onClose(); }}>
        <Copy size={16} />
        Copier l'identifiant
      </button>

      {hasAdminActions && <div className={styles.divider} />}

      {canManageRoles && assignableRoles.length > 0 && (
        <div className={styles.submenuWrapper}
          onMouseEnter={() => setShowRoles(true)}
          onMouseLeave={() => setShowRoles(false)}
        >
          <button className={styles.item}>
            <UserCog size={16} />
            Rôles
            <ChevronRight size={14} className={styles.submenuArrow} />
          </button>
          {showRoles && (
            <div className={styles.submenu}>
              {assignableRoles.map((role: any) => (
                <button key={role.id} className={styles.item} onClick={() => handleRoleToggle(role.id)}>
                  <span
                    className={styles.roleDot}
                    style={{ background: role.color || 'var(--text-muted)' }}
                  />
                  <span className={styles.roleItem}>{role.name}</span>
                  {member.roles.includes(role.id) && <span className={styles.roleCheck}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {canModerate && (
        <div>
          {!showTimeout ? (
            <button className={styles.item} onClick={() => setShowTimeout(true)}>
              <Clock size={16} />
              Mettre en sourdine
            </button>
          ) : (
            <div className={styles.timeoutForm}>
              <select className={styles.timeoutSelect} value={timeoutDuration} onChange={(e) => setTimeoutDuration(e.target.value)}>
                <option value="60">1 minute</option>
                <option value="300">5 minutes</option>
                <option value="600">10 minutes</option>
                <option value="1800">30 minutes</option>
                <option value="3600">1 heure</option>
                <option value="86400">1 jour</option>
                <option value="604800">1 semaine</option>
              </select>
              <button className={styles.timeoutButton} onClick={handleTimeout}>
                Confirmer
              </button>
            </div>
          )}
        </div>
      )}

      {canKick && (
        <button className={`${styles.item} ${styles.itemDanger}`} onClick={handleKick}>
          <UserMinus size={16} />
          Expulser
        </button>
      )}
      {canBan && (
        <button className={`${styles.item} ${styles.itemDanger}`} onClick={handleBan}>
          <Ban size={16} />
          Bannir
        </button>
      )}
    </div>,
    document.body,
  );
}
