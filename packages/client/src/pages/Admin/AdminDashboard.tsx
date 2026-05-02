import { useEffect, useState } from 'react';
import { Users, Server, MessageSquare, Wifi, HardDrive, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import styles from './AdminLayout.module.css';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function SparkLine({ data, color = '#5865F2' }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const width = 280;
  const height = 60;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  });
  const d = `M${pts.join(' L')}`;
  const fillD = `M${pts[0]} L${pts.join(' L')} L${width},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '60px' }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#grad-${color.replace('#', '')})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.admin.getStats<any>(),
      api.admin.getStatsCharts<any>(),
      api.admin.getRecentAuditActivity<any>(),
    ]).then(([s, c, a]) => {
      setStats(s);
      setCharts(c);
      setActivity(a.logs || []);
    }).catch((err) => {
      console.error('Admin dashboard load failed:', err);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.loading}>Chargement…</div>;

  const statCards = [
    { label: 'Utilisateurs', value: stats?.total_users?.toLocaleString() ?? '—', icon: Users, color: '#5865F2' },
    { label: 'Serveurs', value: stats?.total_guilds?.toLocaleString() ?? '—', icon: Server, color: '#57F287' },
    { label: 'Messages (24h)', value: stats?.messages_24h?.toLocaleString() ?? '—', icon: MessageSquare, color: '#FEE75C' },
    { label: 'Connexions actives', value: stats?.active_connections?.toLocaleString() ?? '—', icon: Wifi, color: '#EB459E' },
    { label: 'Stockage utilisé', value: formatBytes(stats?.storage_used_bytes ?? 0), icon: HardDrive, color: '#ED4245' },
    { label: 'Uptime', value: formatUptime(stats?.system?.uptime_seconds ?? 0), icon: AlertTriangle, color: '#F0B132' },
  ];

  const msgData = (charts?.messages ?? []).map((d: any) => d.count);
  const usersData = (charts?.new_users ?? []).map((d: any) => d.count);
  const activeData = (charts?.active_users ?? []).map((d: any) => d.count);

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Tableau de bord</div>
          <div className={styles.pageSubtitle}>Vue d'ensemble de la plateforme OpenCord</div>
        </div>
      </div>

      <div className={styles.statsGrid}>
        {statCards.map((card) => (
          <div key={card.label} className={styles.statCard}>
            <div className={styles.statIcon} style={{ color: card.color }}>
              <card.icon size={20} />
            </div>
            <div className={styles.statLabel}>{card.label}</div>
            <div className={styles.statValue} style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Messages (30 derniers jours)</div>
          <SparkLine data={msgData} color="#5865F2" />
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Nouveaux utilisateurs (30 derniers jours)</div>
          <SparkLine data={usersData} color="#57F287" />
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Utilisateurs actifs (30 derniers jours)</div>
          <SparkLine data={activeData} color="#FEE75C" />
        </div>
        {stats?.system && (
          <div className={styles.chartCard}>
            <div className={styles.chartTitle}>Système</div>
            <div className={styles.detailGrid} style={{ marginTop: 0, gap: '8px' }}>
              <div className={styles.detailItem}>
                <div className={styles.detailKey}>Version Node</div>
                <div className={styles.detailValue}>{stats.system.node_version}</div>
              </div>
              <div className={styles.detailItem}>
                <div className={styles.detailKey}>Heap utilisé</div>
                <div className={styles.detailValue}>{formatBytes(stats.system.heap_used)}</div>
              </div>
              <div className={styles.detailItem}>
                <div className={styles.detailKey}>Heap total</div>
                <div className={styles.detailValue}>{formatBytes(stats.system.heap_total)}</div>
              </div>
              <div className={styles.detailItem}>
                <div className={styles.detailKey}>Base de données</div>
                <div className={styles.detailValue}>{formatBytes(stats.system.db_size_bytes)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {activity.length > 0 && (
        <>
          <div className={styles.sectionTitle}>Activité récente</div>
          <div className={styles.activityList}>
            {activity.map((log: any) => (
              <div key={log.id} className={styles.activityItem}>
                <span style={{ fontSize: 12, fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>
                  {log.action}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  par {log.admin?.username ?? '?'}
                  {log.target_type && ` → ${log.target_type} #${log.target_id?.slice(0, 8)}`}
                </span>
                <span className={styles.activityTime}>
                  {new Date(log.created_at).toLocaleString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
