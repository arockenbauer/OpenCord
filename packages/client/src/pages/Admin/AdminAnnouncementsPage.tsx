import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import styles from './AdminLayout.module.css';

const ANNOUNCEMENT_TYPES = [
  { value: 'info', label: 'Info', color: '#5865F2' },
  { value: 'warning', label: 'Avertissement', color: '#F0B132' },
  { value: 'error', label: 'Erreur / Urgence', color: '#ED4245' },
  { value: 'success', label: 'Succès', color: '#57F287' },
  { value: 'maintenance', label: 'Maintenance', color: '#9B59B6' },
];

function AnnouncementFormModal({ ann, onClose, onSaved }: { ann?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: ann?.title ?? '',
    content: ann?.content ?? '',
    type: ann?.type ?? 'info',
    active: ann?.active ?? true,
    expires_at: ann?.expires_at ? new Date(ann.expires_at).toISOString().slice(0, 16) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const body = { ...form, expires_at: form.expires_at || null };
      if (ann) {
        await api(`/api/admin/announcements/${ann.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/api/admin/announcements', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>{ann ? 'Modifier l\'annonce' : 'Créer une annonce'}</div>
          <button className={styles.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div style={{ color: 'var(--text-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Titre</div>
          <input className={styles.fieldInput} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Titre de l'annonce" />
        </div>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Contenu</div>
          <textarea className={styles.fieldTextarea} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Contenu de l'annonce…" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Type</div>
            <select className={styles.fieldSelect} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {ANNOUNCEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Expiration (optionnel)</div>
            <input type="datetime-local" className={styles.fieldInput} value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
          </div>
        </div>
        <div className={styles.field}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className={styles.toggle}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span className={styles.toggleSlider} />
            </label>
            <span style={{ fontSize: 14 }}>Annonce active (visible par les utilisateurs)</span>
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Annuler</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave} disabled={saving || !form.title || !form.content}>
            {saving ? '…' : ann ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editAnn, setEditAnn] = useState<any | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const adminLevel = useAuthStore((s) => s.user?.admin_level ?? 0);

  const load = () => {
    setLoading(true);
    api.admin.getAnnouncements<{ announcements: any[] }>()
      .then((data) => setAnnouncements((data as any).announcements ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleAll = () => {
    if (selected.size === announcements.length) setSelected(new Set());
    else setSelected(new Set(announcements.map((a) => a.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (action: string, opts?: { confirmText?: string }) => {
    if (selected.size === 0) return;
    const count = selected.size;
    if (opts?.confirmText && !window.confirm(opts.confirmText.replace('{count}', String(count)))) return;
    setBulkBusy(true);
    try {
      const res = await api.admin.bulkAnnouncements<{ succeeded: number; failed: number }>(action, Array.from(selected));
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

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette annonce ?')) return;
    try {
      await api(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleToggle = async (ann: any) => {
    try {
      await api(`/api/admin/announcements/${ann.id}`, { method: 'PATCH', body: JSON.stringify({ active: !ann.active }) });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const typeInfo = (type: string) => ANNOUNCEMENT_TYPES.find((t) => t.value === type) ?? { value: 'info', label: 'Info', color: '#5865F2' };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Annonces</div>
          <div className={styles.pageSubtitle}>Bannières visibles par tous les utilisateurs connectés</div>
        </div>
        {adminLevel >= 2 && (
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Créer une annonce
          </button>
        )}
      </div>

      <div className={styles.tableWrapper}>
        {selected.size > 0 && adminLevel >= 2 && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkBarCount}>{selected.size} sélectionné(s)</span>
            <div className={styles.bulkBarSpacer} />
            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('activate', { confirmText: 'Activer {count} annonce(s) ?' })}>
              Activer
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('deactivate', { confirmText: 'Désactiver {count} annonce(s) ?' })}>
              Désactiver
            </button>
            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('delete', { confirmText: 'Supprimer {count} annonce(s) ?' })}>
              <Trash2 size={13} /> Supprimer
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              <X size={13} /> Annuler
            </button>
          </div>
        )}

        {loading ? (
          <div className={styles.loading}>Chargement…</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {adminLevel >= 2 && (
                  <th className={styles.checkboxCell}>
                    <input type="checkbox" checked={selected.size > 0 && selected.size === announcements.length} onChange={toggleAll} />
                  </th>
                )}
                <th>Titre</th>
                <th>Contenu</th>
                <th>Type</th>
                <th>Active</th>
                <th>Expiration</th>
                <th>Créé le</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((ann) => {
                const t = typeInfo(ann.type);
                return (
                  <tr key={ann.id}>
                    {adminLevel >= 2 && (
                      <td className={styles.checkboxCell}>
                        <input type="checkbox" checked={selected.has(ann.id)} onChange={() => toggleOne(ann.id)} />
                      </td>
                    )}
                    <td style={{ fontWeight: 600 }}>{ann.title}</td>
                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: 'var(--text-muted)' }}>{ann.content}</td>
                    <td><span className={styles.badge} style={{ background: `${t.color}22`, color: t.color }}>{t.label}</span></td>
                    <td>
                      {adminLevel >= 2 ? (
                        <label className={styles.toggle}>
                          <input type="checkbox" checked={ann.active} onChange={() => handleToggle(ann)} />
                          <span className={styles.toggleSlider} />
                        </label>
                      ) : (
                        <span className={`${styles.badge} ${ann.active ? styles.badgeGreen : styles.badgeGray}`}>{ann.active ? 'Oui' : 'Non'}</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {ann.expires_at ? new Date(ann.expires_at).toLocaleString('fr-FR') : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(ann.created_at).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <div className={styles.actionRow}>
                        {adminLevel >= 2 && (
                          <>
                            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall} ${styles.btnIcon}`} onClick={() => setEditAnn(ann)}>
                              <Pencil size={13} />
                            </button>
                            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall} ${styles.btnIcon}`} onClick={() => handleDelete(ann.id)}>
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {announcements.length === 0 && (
                <tr><td colSpan={7}><div className={styles.emptyState}>Aucune annonce.</div></td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <AnnouncementFormModal onClose={() => setShowCreate(false)} onSaved={load} />}
      {editAnn && <AnnouncementFormModal ann={editAnn} onClose={() => setEditAnn(null)} onSaved={load} />}
    </div>
  );
}
