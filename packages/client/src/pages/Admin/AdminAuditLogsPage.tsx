import { useEffect, useState, useCallback } from 'react';
import { Filter } from 'lucide-react';
import { api } from '../../services/api';
import styles from './AdminLayout.module.css';

const ACTION_COLORS: Record<string, string> = {
  USER_BAN: 'badgeRed', USER_UNBAN: 'badgeGreen', USER_FORCE_LOGOUT: 'badgeYellow',
  USER_DISABLE: 'badgeRed', USER_ENABLE: 'badgeGreen', USER_LEVEL_CHANGE: 'badgeBlue',
  BADGE_CREATE: 'badgeGreen', BADGE_DELETE: 'badgeRed', BADGE_ASSIGN: 'badgeBlue', BADGE_REVOKE: 'badgeYellow',
  GUILD_DELETE: 'badgeRed', GUILD_FEATURE_UPDATE: 'badgeBlue',
  REPORT_RESOLVE: 'badgeGreen', PLUGIN_TOGGLE: 'badgePurple',
  ANNOUNCEMENT_CREATE: 'badgeBlue', ANNOUNCEMENT_DELETE: 'badgeRed',
};

export function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params: any = { limit: 50, offset: (page - 1) * 50 };
    if (actionFilter) params.action = actionFilter;
    if (targetTypeFilter) params.target_type = targetTypeFilter;
    api.admin.getAuditLogs<any>(params)
      .then((data) => { setLogs((data as any).logs ?? []); setTotal((data as any).total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, actionFilter, targetTypeFilter]);

  useEffect(() => { load(); }, [load]);

  const uniqueActions = [...new Set(logs.map((l) => l.action))];

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Journal d'audit</div>
          <div className={styles.pageSubtitle}>{total.toLocaleString()} entrée{total !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <div className={styles.tableToolbar}>
          <Filter size={14} style={{ color: 'var(--text-muted)' }} />
          <select className={styles.filterSelect} value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}>
            <option value="">Toutes les actions</option>
            {Object.keys(ACTION_COLORS).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className={styles.filterSelect} value={targetTypeFilter} onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}>
            <option value="">Tous les types</option>
            <option value="user">Utilisateur</option>
            <option value="guild">Serveur</option>
            <option value="badge">Badge</option>
            <option value="report">Signalement</option>
            <option value="plugin">Plugin</option>
            <option value="announcement">Annonce</option>
          </select>
        </div>

        {loading ? <div className={styles.loading}>Chargement…</div> : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Action</th>
                <th>Admin</th>
                <th>Type cible</th>
                <th>ID cible</th>
                <th>Détails</th>
                <th>IP</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const colorClass = ACTION_COLORS[log.action] ?? 'badgeGray';
                return (
                  <tr key={log.id}>
                    <td>
                      <span className={`${styles.badge} ${styles[colorClass as keyof typeof styles]}`} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <div className={styles.userRow}>
                        <div className={styles.avatar} style={{ width: 24, height: 24, fontSize: 10 }}>
                          {log.admin?.avatar ? <img src={log.admin.avatar} alt="" /> : log.admin?.username?.slice(0, 1).toUpperCase() ?? '?'}
                        </div>
                        <span style={{ fontSize: 13 }}>{log.admin?.username ?? '?'}</span>
                      </div>
                    </td>
                    <td>{log.target_type ? <span className={`${styles.badge} ${styles.badgeGray}`} style={{ fontSize: 11 }}>{log.target_type}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{log.target_id?.slice(0, 10) ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{log.ip_address ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('fr-FR')}</td>
                  </tr>
                );
              })}
              {logs.length === 0 && <tr><td colSpan={7}><div className={styles.emptyState}>Aucun log d'audit.</div></td></tr>}
            </tbody>
          </table>
        )}
        <div className={styles.tablePagination}>
          <span>Page {page} — {total} résultats</span>
          <div className={styles.paginationBtns}>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Préc.</button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={logs.length < 50} onClick={() => setPage(p => p + 1)}>Suiv.</button>
          </div>
        </div>
      </div>
    </div>
  );
}
