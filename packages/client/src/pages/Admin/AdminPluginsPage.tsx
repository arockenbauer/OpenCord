import { useEffect, useState, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import styles from './AdminLayout.module.css';

export function AdminPluginsPage() {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const adminLevel = useAuthStore((s) => s.user?.admin_level ?? 0);

  const load = useCallback(() => {
    setLoading(true);
    api.admin.getPlugins<{ plugins: any[] }>()
      .then((data) => {
        const list = (data as any).plugins ?? (Array.isArray(data) ? data : []);
        setPlugins(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setSelected(new Set()); }, []);

  const toggleAll = () => {
    if (selected.size === plugins.length) setSelected(new Set());
    else setSelected(new Set(plugins.map((p) => p.slug)));
  };

  const toggleOne = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const runBulk = async (action: 'enable' | 'disable') => {
    if (selected.size === 0) return;
    const count = selected.size;
    const actionText = action === 'enable' ? 'activer' : 'désactiver';
    if (!window.confirm(`${actionText.charAt(0).toUpperCase() + actionText.slice(1)} ${count} plugin(s) ?`)) return;
    setBulkBusy(true);
    try {
      const res = await api.admin.bulkPlugins<{ succeeded: number; failed: number }>(action, Array.from(selected));
      if (res?.failed) {
        window.alert(`${res.succeeded} réussi(s), ${res.failed} échec(s).`);
      }
      setSelected(new Set());
      load();
    } catch (e: any) {
      window.alert(`Erreur : ${e?.message || 'inconnue'}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const togglePlugin = async (slug: string, enabled: boolean) => {
    try {
      await api(`/api/admin/plugins/${slug}`, { method: 'PATCH', body: JSON.stringify({ enabled_by_default: enabled }) });
      setPlugins((prev) => prev.map((p) => p.slug === slug ? { ...p, enabled_by_default: enabled } : p));
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

      <div className={styles.tableWrapper}>
        {selected.size > 0 && adminLevel >= 2 && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkBarCount}>{selected.size} sélectionné(s)</span>
            <div className={styles.bulkBarSpacer} />
            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('enable')}>
              <Check size={13} /> Activer
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('disable')}>
              Désactiver
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              <X size={13} /> Annuler
            </button>
          </div>
        )}

        {loading ? <div className={styles.loading}>Chargement…</div> : (
          <table className={styles.table}>
            <thead>
              <tr>
                {adminLevel >= 2 && (
                  <th className={styles.checkboxCell}>
                    <input type="checkbox" checked={selected.size > 0 && selected.size === plugins.length} onChange={toggleAll} />
                  </th>
                )}
                <th>Plugin</th>
                <th>Slug</th>
                <th>Utilisateurs actifs</th>
                <th>Serveurs actifs</th>
                <th>Activé par défaut</th>
              </tr>
            </thead>
            <tbody>
              {plugins.map((p) => (
                <tr key={p.slug}>
                  {adminLevel >= 2 && (
                    <td className={styles.checkboxCell}>
                      <input type="checkbox" checked={selected.has(p.slug)} onChange={() => toggleOne(p.slug)} />
                    </td>
                  )}
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
                        <input type="checkbox" checked={!!p.enabled_by_default} onChange={(e) => togglePlugin(p.slug, e.target.checked)} />
                        <span className={styles.toggleSlider} />
                      </label>
                    ) : (
                      <span className={`${styles.badge} ${p.enabled_by_default ? styles.badgeGreen : styles.badgeGray}`}>
                        {p.enabled_by_default ? 'Oui' : 'Non'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {plugins.length === 0 && <tr><td colSpan={adminLevel >= 2 ? 6 : 5}><div className={styles.emptyState}>Aucun plugin configuré.</div></td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
