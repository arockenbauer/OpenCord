import { useState, MouseEvent } from 'react';
import { useGuildStore } from '../../stores/guildStore';
import { useUIStore } from '../../stores/uiStore';
import { MemberContextMenu } from '../context-menus/MemberContextMenu';
import styles from './MemberList.module.css';

const statusColors: Record<string, string> = {
  online: 'var(--status-online)',
  idle: 'var(--status-idle)',
  dnd: 'var(--status-dnd)',
  invisible: 'var(--status-offline)',
  offline: 'var(--status-offline)',
};

export function MemberList() {
  const guild = useGuildStore((s) => s.getSelectedGuild());
  const showMemberList = useUIStore((s) => s.showMemberList);
  const setProfilePopover = useUIStore((s) => s.setProfilePopover);
  const [memberCtxMenu, setMemberCtxMenu] = useState<{ member: any; x: number; y: number } | null>(null);

  if (!showMemberList || !guild) return null;

  const onlineMembers = guild.members.filter((m) => m.user.status !== 'offline' && m.user.status !== 'invisible');
  const offlineMembers = guild.members.filter((m) => m.user.status === 'offline' || m.user.status === 'invisible');

  const roleGroups = new Map<string, typeof onlineMembers>();
  for (const member of onlineMembers) {
    const hoistRole = guild.roles
      .filter((r) => r.hoist && member.roles && member.roles.includes(r.id))
      .sort((a, b) => b.position - a.position)[0];
    const groupName = hoistRole ? hoistRole.name : 'EN LIGNE';
    if (!roleGroups.has(groupName)) roleGroups.set(groupName, []);
    roleGroups.get(groupName)!.push(member);
  }

  const openProfile = (event: MouseEvent<HTMLDivElement>, userId: string) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setProfilePopover({ userId, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };

  const handleMemberContextMenu = (event: MouseEvent<HTMLDivElement>, member: any) => {
    event.preventDefault();
    setMemberCtxMenu({ member, x: event.clientX, y: event.clientY });
  };

  return (
    <div className={styles.container} role="listbox" aria-label="Membres" data-testid="member-list">
      {Array.from(roleGroups.entries()).map(([name, members]) => (
        <div key={name} role="group" aria-labelledby={`group-${name}`}>
          <div className={styles.groupHeader} id={`group-${name}`}>{name} — {members.length}</div>
          {members.map((member) => (
            <MemberItem
              key={member.user.id}
              member={member}
              guild={guild}
              onClick={(event) => openProfile(event, member.user.id)}
              onContextMenu={(event) => handleMemberContextMenu(event, member)}
            />
          ))}
        </div>
      ))}

      {offlineMembers.length > 0 && (
        <div role="group" aria-labelledby="group-offline">
          <div className={styles.groupHeader} id="group-offline">HORS LIGNE — {offlineMembers.length}</div>
          {offlineMembers.map((member) => (
            <MemberItem
              key={member.user.id}
              member={member}
              guild={guild}
              offline
              onClick={(event) => openProfile(event, member.user.id)}
              onContextMenu={(event) => handleMemberContextMenu(event, member)}
            />
          ))}
        </div>
      )}
      {memberCtxMenu && guild && (
        <MemberContextMenu
          member={memberCtxMenu.member}
          guildId={guild.id}
          position={{ x: memberCtxMenu.x, y: memberCtxMenu.y }}
          onClose={() => setMemberCtxMenu(null)}
          onViewProfile={() => {
            const el = document.querySelector(`[data-user-id="${memberCtxMenu.member.user.id}"]`) as HTMLElement;
            if (el) {
              const rect = el.getBoundingClientRect();
              setProfilePopover({ userId: memberCtxMenu.member.user.id, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
            }
            setMemberCtxMenu(null);
          }}
        />
      )}
    </div>
  );
}

function MemberItem({ member, guild, offline, onClick, onContextMenu }: { member: any; guild: any; offline?: boolean; onClick: (event: MouseEvent<HTMLDivElement>) => void; onContextMenu: (event: MouseEvent<HTMLDivElement>) => void }) {
  const displayName = member.nickname || member.user.global_name || member.user.username;
  const topRole = guild.roles
    .filter((r: any) => member.roles && member.roles.includes(r.id) && r.color)
    .sort((a: any, b: any) => b.position - a.position)[0];

  const activityEl = member.user.activities && member.user.activities.length > 0 ? (() => {
    const activity = member.user.activities[0]; // Afficher la première activité
    let timeEl = null;
    let progressBar = null;
    let liveBadge = null;

    // Calculer la durée écoulée
    if (activity.timestamps?.start) {
      const start = activity.timestamps.start * 1000; // Convertir en ms
      const now = Date.now();
      const elapsed = Math.floor((now - start) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      timeEl = <div className={styles.richPresenceTime}>En cours depuis {mins}m {secs}s</div>;

      // Barre de progression pour la musique (type=LISTENING)
      if (activity.type === 2 && activity.timestamps.end) {
        const end = activity.timestamps.end * 1000;
        const total = end - start;
        const progress = Math.min(100, Math.max(0, ((now - start) / total) * 100));
        progressBar = (
          <div className={styles.progressBarContainer}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          </div>
        );
      }
    }

    // Badge LIVE pour STREAMING avec URL
    if (activity.type === 1 && activity.url) {
      liveBadge = <span className={styles.liveBadge}>LIVE</span>;
    }

    return (
      <div className={styles.richPresence}>
        <div className={styles.richPresenceName}>
          {activity.name} {liveBadge}
        </div>
        {activity.state && <div className={styles.richPresenceDetail}>{activity.state}</div>}
        {activity.details && <div className={styles.richPresenceDetail}>{activity.details}</div>}
        {timeEl}
        {progressBar}
      </div>
    );
  })() : null;

  return (
    <div
      className={`${styles.member} ${offline ? styles.offline : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      data-user-popout-trigger="true"
      data-user-id={member.user.id}
      role="button"
      tabIndex={0}
      aria-label={`${displayName}${offline ? ' (hors ligne)' : ''}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(e as any); } }}
    >
      <div className={styles.avatar}>
        {member.user.avatar ? <img src={member.user.avatar} alt="" /> : displayName.slice(0, 1).toUpperCase()}
        <div className={styles.statusDot} style={{ background: statusColors[member.user.status] || statusColors.offline }} />
      </div>
      <div className={styles.memberInfo}>
        <div className={styles.memberName} style={topRole?.color ? { color: topRole.color } : undefined}>
          {displayName}
        </div>
        {member.user.custom_status_text || member.user.custom_status_emoji ? (
          <div className={styles.memberActivity}>
            {member.user.custom_status_emoji && <span>{member.user.custom_status_emoji} </span>}
            {member.user.custom_status_text && <span>{member.user.custom_status_text}</span>}
          </div>
        ) : null}
        {activityEl}
      </div>
    </div>
  );
}
