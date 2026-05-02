import { useEffect, useState, useCallback } from 'react';
import { X, Check, Filter } from 'lucide-react';
import { api } from '../../services/api';
import styles from './AdminLayout.module.css';

function ReportDetailModal({ report, onClose, onUpdated }: { report: any; onClose: () => void; onUpdated: () => void }) {
  const [notes, setNotes] = useState(report.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const handleUpdate = async (status: string) => {
    setSaving(true);
    try {
      await api(`/api/admin/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status, notes }) });
      setMsg(`Signalement marqué "${status}"`);
      onUpdated();
    } catch (e: any) {
      setMsg(e.message);
    }
    setSaving(false);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Signalement #{report.id.slice(0, 8)}</div>
          <button className={styles.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        {msg && <div style={{ color: 'var(--text-positive)', fontSize: 13, marginBottom: 12 }}>{msg}</div>}
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}><div className={styles.detailKey}>Signalé par</div><div className={styles.detailValue}>{report.reporter?.username ?? '?'}#{report.reporter?.discriminator}</div></div>
          <div className={styles.detailItem}><div className={styles.detailKey}>Type de cible</div><div className={styles.detailValue}>{report.target_type}</div></div>
          <div className={styles.detailItem}><div className={styles.detailKey}>ID cible</div><div className={styles.detailValue} style={{ fontFamily: 'monospace', fontSize: 12 }}>{report.target_id}</div></div>
          <div className={styles.detailItem}><div className={styles.detailKey}>Statut</div><div className={styles.detailValue}>{report.status}</div></div>
          <div className={styles.detailItem}><div className={styles.detailKey}>Créé le</div><div className={styles.detailValue}>{new Date(report.created_at).toLocaleString('fr-FR')}</div></div>
          {report.resolved_at && <div className={styles.detailItem}><div className={styles.detailKey}>Résolu le</div><div className={styles.detailValue}>{new Date(report.resolved_at).toLocaleString('fr-FR')}</div></div>}
        </div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 16px', fontSize: 14, marginBottom: 16 }}>
          <div className={styles.detailKey} style={{ marginBottom: 6 }}>Raison</div>
          {report.reason}
        </div>
        {report.status === 'pending' && (
          <>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Notes modérateur</div>
              <textarea className={styles.fieldTextarea} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes internes (optionnel)…" />
            </div>
            <div className={styles.actionRow}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => handleUpdate('resolved')} disabled={saving}>
                <Check size={14} /> Résoudre
              </button>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => handleUpdate('dismissed')} disabled={saving}>
                Rejeter
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AdminReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailReport, setDetailReport] = useState<any | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params: any = { limit: 50, offset: (page - 1) * 50 };
    if (statusFilter) params.status = statusFilter;
    if (targetTypeFilter) params.target_type = targetTypeFilter;
    api.admin.getReports<any>(params)
      .then((data) => {
        setReports((data as any).reports ?? []);
        setTotal((data as any).total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter, targetTypeFilter]);

  useEffect(() => { load(); }, [load]);

  const statusBadge = (s: string) => {
    if (s === 'pending') return <span className={`${styles.badge} ${styles.badgeYellow}`}>En attente</span>;
    if (s === 'resolved') return <span className={`${styles.badge} ${styles.badgeGreen}`}>Résolu</span>;
    if (s === 'dismissed') return <span className={`${styles.badge} ${styles.badgeGray}`}>Rejeté</span>;
    return <span className={`${styles.badge} ${styles.badgeGray}`}>{s}</span>;
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Signalements</div>
          <div className={styles.pageSubtitle}>{total} signalement{total !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <div className={styles.tableToolbar}>
          <Filter size={14} style={{ color: 'var(--text-muted)' }} />
          <select className={styles.filterSelect} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="resolved">Résolus</option>
            <option value="dismissed">Rejetés</option>
          </select>
          <select className={styles.filterSelect} value={targetTypeFilter} onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}>
            <option value="">Tous les types</option>
            <option value="user">Utilisateur</option>
            <option value="message">Message</option>
            <option value="guild">Serveur</option>
          </select>
        </div>

        {loading ? <div className={styles.loading}>Chargement…</div> : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Signalé par</th>
                <th>Type cible</th>
                <th>ID cible</th>
                <th>Raison</th>
                <th>Statut</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setDetailReport(r)}>
                  <td>
                    <div className={styles.userRow}>
                      <div className={styles.avatar} style={{ width: 28, height: 28, fontSize: 11 }}>
                        {r.reporter?.username?.slice(0, 1).toUpperCase() ?? '?'}
                      </div>
                      <span style={{ fontSize: 13 }}>{r.reporter?.username ?? '?'}#{r.reporter?.discriminator}</span>
                    </div>
                  </td>
                  <td><span className={`${styles.badge} ${styles.badgeGray}`}>{r.target_type}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{r.target_id?.slice(0, 12)}…</td>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{r.reason}</td>
                  <td>{statusBadge(r.status)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString('fr-FR')}</td>
                  <td><X size={14} style={{ opacity: 0 }} /></td>
                </tr>
              ))}
              {reports.length === 0 && <tr><td colSpan={7}><div className={styles.emptyState}>Aucun signalement{statusFilter ? ` avec le statut "${statusFilter}"` : ''}.</div></td></tr>}
            </tbody>
          </table>
        )}
        <div className={styles.tablePagination}>
          <span>Page {page} — {total} résultats</span>
          <div className={styles.paginationBtns}>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Préc.</button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={reports.length < 50} onClick={() => setPage(p => p + 1)}>Suiv.</button>
          </div>
        </div>
      </div>

      {detailReport && <ReportDetailModal report={detailReport} onClose={() => setDetailReport(null)} onUpdated={() => { setDetailReport(null); load(); }} />}
    </div>
  );
}
