import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import styles from './AdminLayout.module.css';

export function AdminPluginsPage() {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const adminLevel = useAuthStore((s) => s.user?.admin_level ?? 0);

  const load = () => {
    setLoading(true);
    api.admin.getPlugins<{ plugins: any[] }>()
      .then((data) => {
        const list = (data as any).plugins ?? (Array.isArray(data) ? data : []);
        setPlugins(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const togglePlugin = async (slug: string, enabled: boolean) => {
    try {
      await api(`/api/admin/plugins/${slug}`, { method: 'PATCH', body: JSON.stringify({ globally_enabled: enabled }) });
      setPlugins((prev) => prev.map((p) => p.slug === slug ? { ...p, globally_enabled: enabled } : p));
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Plugins</div>
          <div className={styles.pageSubtitle}>{plugins.length} plugin{plugins.length !== 1 ? 's' : ''} configuré{plugins.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {loading ? <div className={styles.loading}>Chargement…</div> : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Plugin</th>
                <th>Slug</th>
                <th>Utilisateurs actifs</th>
                <th>Serveurs actifs</th>
                <th>Activé globalement</th>
              </tr>
            </thead>
            <tbody>
              {plugins.map((p) => (
                <tr key={p.slug}>
                  <td>
                    <div className={styles.userRow}>
                      {p.icon && <span style={{ fontSize: 20 }}>{p.icon}</span>}
                      <div>
                        <div className={styles.userName}>{p.name}</div>
                        {p.description && <div className={styles.userTag}>{p.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{p.slug}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.users_enabled_count}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.guilds_enabled_count}</td>
                  <td>
                    {adminLevel >= 2 ? (
                      <label className={styles.toggle}>
                        <input type="checkbox" checked={!!p.globally_enabled} onChange={(e) => togglePlugin(p.slug, e.target.checked)} />
                        <span className={styles.toggleSlider} />
                      </label>
                    ) : (
                      <span className={`${styles.badge} ${p.globally_enabled ? styles.badgeGreen : styles.badgeGray}`}>
                        {p.globally_enabled ? 'Oui' : 'Non'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {plugins.length === 0 && <tr><td colSpan={5}><div className={styles.emptyState}>Aucun plugin configuré.</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
