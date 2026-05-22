import { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw, HardDrive, Clock, FileArchive, X, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import styles from './AdminLayout.module.css';

interface Backup {
  id: string;
  filename: string;
  size_bytes: number;
  created_at: string;
  status: 'completed' | 'pending' | 'failed';
  note?: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const statusStyles: Record<Backup['status'], { cls: string; label: string }> = {
  completed: { cls: styles.badgeGreen ?? '', label: 'Termine' },
  pending:   { cls: styles.badgeYellow ?? '', label: 'En cours' },
  failed:    { cls: styles.badgeRed ?? '', label: 'Echoue' },
};

export function AdminBackupsPage() {
  const adminLevel = useAuthStore((s) => s.user?.admin_level ?? 0);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.admin.getBackups<{ backups: Backup[] }>()
      .then((data) => {
        setBackups(Array.isArray(data) ? data as unknown as Backup[] : data.backups ?? []);
      })
      .catch((e: any) => setMsg({ text: e.message, error: true }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setSelected(new Set()); }, []);

  const toggleAll = () => {
    if (selected.size === backups.length) setSelected(new Set());
    else setSelected(new Set(backups.map((b) => b.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (action: string) => {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!window.confirm(`Supprimer définitivement ${count} sauvegarde(s) ? Cette action est irréversible.`)) return;
    setBulkBusy(true);
    try {
      const res = await api.admin.bulkBackups<{ succeeded: number; failed: number }>(action, Array.from(selected));
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

  const handleCreate = async () => {
    if (!confirm('Lancer une sauvegarde complète de la base de données ? Cette opération peut prendre quelques minutes.')) return;
    setCreating(true);
    setMsg(null);
    try {
      await api('/api/admin/backups', { method: 'POST' });
      setMsg({ text: 'Sauvegarde lancée. Actualisez dans quelques instants.', error: false });
      load();
    } catch (e: any) {
      setMsg({ text: e.message, error: true });
    }
    setCreating(false);
  };

  const totalSize = backups.reduce((acc, b) => acc + (b.size_bytes ?? 0), 0);
  const completed = backups.filter((b) => b.status === 'completed').length;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Sauvegardes</div>
          <div className={styles.pageSubtitle}>
            {backups.length} sauvegarde{backups.length !== 1 ? 's' : ''} · {formatBytes(totalSize)} au total
          </div>
        </div>
        <div className={styles.actionRow}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={15} /> Actualiser
          </button>
          {adminLevel >= 3 ? (
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleCreate}
              disabled={creating}
            >
              <Plus size={15} /> {creating ? 'Lancement…' : 'Créer une sauvegarde'}
            </button>
          ) : (
            <span
              className={`${styles.btn} ${styles.btnSecondary}`}
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
              title="Niveau admin 3 requis"
            >
              <Plus size={15} /> Créer une sauvegarde
            </span>
          )}
        </div>
      </div>

      {msg && (
        <div style={{
          marginBottom: 20,
          padding: '10px 16px',
          borderRadius: 8,
          fontSize: 14,
          background: msg.error ? 'rgba(237,66,69,0.12)' : 'rgba(87,242,135,0.12)',
          color: msg.error ? 'var(--text-danger)' : '#57f287',
          border: `1px solid ${msg.error ? 'rgba(237,66,69,0.3)' : 'rgba(87,242,135,0.3)'}`,
        }}>
          {msg.text}
        </div>
      )}

      {/* Summary cards */}
      <div className={styles.statsGrid} style={{ marginBottom: 24 }}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ color: '#5865F2' }}><FileArchive size={20} /></div>
          <div className={styles.statLabel}>Total sauvegardes</div>
          <div className={styles.statValue} style={{ color: '#5865F2' }}>{backups.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ color: '#57f287' }}><HardDrive size={20} /></div>
          <div className={styles.statLabel}>Taille totale</div>
          <div className={styles.statValue} style={{ color: '#57f287', fontSize: 22 }}>{formatBytes(totalSize)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ color: '#faa61a' }}><Clock size={20} /></div>
          <div className={styles.statLabel}>Dernière sauvegarde</div>
          <div className={styles.statValue} style={{ color: '#faa61a', fontSize: 16 }}>
            {backups.length > 0
              ? new Date(backups[0]!.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
              : '—'}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ color: '#57f287' }}><HardDrive size={20} /></div>
          <div className={styles.statLabel}>Réussies</div>
          <div className={styles.statValue} style={{ color: '#57f287' }}>{completed}</div>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Chargement…</div>
      ) : (
        <div className={styles.tableWrapper}>
          {selected.size > 0 && adminLevel >= 3 && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkBarCount}>{selected.size} sélectionné(s)</span>
              <div className={styles.bulkBarSpacer} />
              <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} disabled={bulkBusy}
                onClick={() => runBulk('delete')}>
                <Trash2 size={13} /> Supprimer
              </button>
              <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} onClick={() => setSelected(new Set())} disabled={bulkBusy}>
                <X size={13} /> Annuler
              </button>
            </div>
          )}

          <table className={styles.table}>
            <thead>
              <tr>
                {adminLevel >= 3 && (
                  <th className={styles.checkboxCell}>
                    <input type="checkbox" checked={selected.size > 0 && selected.size === backups.length} onChange={toggleAll} />
                  </th>
                )}
                <th>Fichier</th>
                <th>Taille</th>
                <th>Statut</th>
                <th>Note</th>
                <th>Créé le</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => {
                const s = statusStyles[b.status] ?? statusStyles.failed;
                return (
                  <tr key={b.id}>
                    {adminLevel >= 3 && (
                      <td className={styles.checkboxCell}>
                        <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleOne(b.id)} />
                      </td>
                    )}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileArchive size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{b.filename}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {b.size_bytes ? formatBytes(b.size_bytes) : '—'}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${s.cls}`}>{s.label}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {b.note ?? '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(b.created_at).toLocaleString('fr-FR')}
                    </td>
                  </tr>
                );
              })}
              {backups.length === 0 && (
                <tr>
                  <td colSpan={adminLevel >= 3 ? 6 : 5}>
                    <div className={styles.emptyState}>
                      Aucune sauvegarde disponible. Cliquez sur "Créer une sauvegarde" pour en lancer une.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {adminLevel < 3 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
              Niveau admin 3 requis pour créer des sauvegardes.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
