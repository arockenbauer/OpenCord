import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  LayoutDashboard, Users, Award, Server, Flag, Puzzle,
  Megaphone, ScrollText, ChevronLeft, ShieldAlert, Settings, HardDrive,
} from 'lucide-react';
import styles from './AdminLayout.module.css';

export function AdminLayout() {
  const user = useAuthStore((s) => s.user);

  if (!user) return <Navigate to="/login" replace />;
  if ((user.admin_level ?? 0) < 1) return <Navigate to="/channels/@me" replace />;

  const navItems = [
    { to: '/admin', end: true, icon: LayoutDashboard, label: 'Tableau de bord' },
    { to: '/admin/users', icon: Users, label: 'Utilisateurs' },
    { to: '/admin/badges', icon: Award, label: 'Badges' },
    { to: '/admin/guilds', icon: Server, label: 'Serveurs' },
    { to: '/admin/reports', icon: Flag, label: 'Signalements' },
    { to: '/admin/plugins', icon: Puzzle, label: 'Plugins' },
    { to: '/admin/announcements', icon: Megaphone, label: 'Annonces' },
    { to: '/admin/audit-logs', icon: ScrollText, label: 'Journal d\'audit' },
    { to: '/admin/settings', icon: Settings, label: 'Paramètres' },
    { to: '/admin/backups', icon: HardDrive, label: 'Sauvegardes' },
  ];

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitleRow}>
            <ShieldAlert size={16} />
            <span className={styles.sidebarTitle}>Panel Admin</span>
          </div>
          <NavLink to="/channels/@me" className={styles.backLink}>
            <ChevronLeft size={14} /> App
          </NavLink>
        </div>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.adminInfo}>
            <span className={styles.adminLevel}>Niveau {user.admin_level}</span>
            <span className={styles.adminName}>{user.username}</span>
          </div>
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
