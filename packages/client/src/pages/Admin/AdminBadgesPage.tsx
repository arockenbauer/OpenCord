import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Users } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import styles from './AdminLayout.module.css';

function BadgeFormModal({ badge, onClose, onSaved }: { badge?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: badge?.name ?? '',
    label: badge?.label ?? '',
    description: badge?.description ?? '',
    icon: badge?.icon ?? '',
    color: badge?.color ?? '#5865F2',
    priority: badge?.priority ?? 100,
    type: badge?.type ?? 'admin',
    display_type: badge?.display_type ?? 'icon',
    background_color: badge?.background_color ?? '#5865F2',
    text_color: badge?.text_color ?? '#ffffff',
    border_color: badge?.border_color ?? '#5865F2',
    gradient_start: badge?.gradient_start ?? '#FF73FA',
    gradient_end: badge?.gradient_end ?? '#7367F0',
    glow: badge?.glow ?? false,
    glow_color: badge?.glow_color ?? '#FF73FA',
    icon_position: badge?.icon_position ?? 'left',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (badge) {
        await api(`/api/admin/badges/${badge.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/api/admin/badges', { method: 'POST', body: JSON.stringify(form) });
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
          <div className={styles.modalTitle}>{badge ? 'Modifier le badge' : 'Créer un badge'}</div>
          <button className={styles.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div style={{ color: 'var(--text-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Nom interne (ex: OPENCORD_CEO)</div>
          <input className={styles.fieldInput} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="BADGE_NAME" />
        </div>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Label affiché</div>
          <input className={styles.fieldInput} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Nom affiché aux utilisateurs" />
        </div>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Description</div>
          <input className={styles.fieldInput} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description du badge" />
        </div>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Icône (emoji ou URL)</div>
          <input className={styles.fieldInput} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🏆 ou https://..." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Type d'affichage</div>
            <select className={styles.fieldSelect} value={form.display_type} onChange={(e) => setForm({ ...form, display_type: e.target.value })}>
              <option value="icon">Icône seule</option>
              <option value="text">Texte coloré (Discord-style)</option>
              <option value="premium">OpenCord+ Premium (gradient + glow)</option>
            </select>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Priorité (1=plus haute)</div>
            <input type="number" className={styles.fieldInput} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} min="1" max="999" />
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Type</div>
            <select className={styles.fieldSelect} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="system">system</option>
              <option value="admin">admin</option>
              <option value="auto">auto</option>
              <option value="event">event</option>
              <option value="premium">OpenCord+ Premium</option>
            </select>
          </div>
        </div>

        {form.display_type === 'text' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Couleur de fond</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.background_color ?? '#5865F2'} onChange={(e) => setForm({ ...form, background_color: e.target.value })} style={{ width: 40, height: 32, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} />
                <input className={styles.fieldInput} value={form.background_color ?? ''} onChange={(e) => setForm({ ...form, background_color: e.target.value })} style={{ flex: 1 }} />
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Couleur du texte</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.text_color ?? '#ffffff'} onChange={(e) => setForm({ ...form, text_color: e.target.value })} style={{ width: 40, height: 32, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} />
                <input className={styles.fieldInput} value={form.text_color ?? ''} onChange={(e) => setForm({ ...form, text_color: e.target.value })} style={{ flex: 1 }} />
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Couleur de bordure</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.border_color ?? '#5865F2'} onChange={(e) => setForm({ ...form, border_color: e.target.value })} style={{ width: 40, height: 32, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} />
                <input className={styles.fieldInput} value={form.border_color ?? ''} onChange={(e) => setForm({ ...form, border_color: e.target.value })} style={{ flex: 1 }} />
              </div>
            </div>
          </div>
        )}

        {form.display_type === 'premium' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Gradient Start</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.gradient_start ?? '#FF73FA'} onChange={(e) => setForm({ ...form, gradient_start: e.target.value })} style={{ width: 40, height: 32, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} />
                <input className={styles.fieldInput} value={form.gradient_start ?? ''} onChange={(e) => setForm({ ...form, gradient_start: e.target.value })} style={{ flex: 1 }} />
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Gradient End</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.gradient_end ?? '#7367F0'} onChange={(e) => setForm({ ...form, gradient_end: e.target.value })} style={{ width: 40, height: 32, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} />
                <input className={styles.fieldInput} value={form.gradient_end ?? ''} onChange={(e) => setForm({ ...form, gradient_end: e.target.value })} style={{ flex: 1 }} />
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Glow Color</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.glow_color ?? '#FF73FA'} onChange={(e) => setForm({ ...form, glow_color: e.target.value })} style={{ width: 40, height: 32, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} />
                <input className={styles.fieldInput} value={form.glow_color ?? ''} onChange={(e) => setForm({ ...form, glow_color: e.target.value })} style={{ flex: 1 }} />
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.glow} onChange={(e) => setForm({ ...form, glow: e.target.checked })} />
                Activer le glow
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Couleur icône</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={form.color ?? '#5865F2'} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ width: 40, height: 32, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} />
              <input className={styles.fieldInput} value={form.color ?? ''} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="#5865F2" style={{ flex: 1 }} />
            </div>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Position icône</div>
            <select className={styles.fieldSelect} value={form.icon_position} onChange={(e) => setForm({ ...form, icon_position: e.target.value })}>
              <option value="left">À gauche</option>
              <option value="right">À droite</option>
              <option value="inline">Inline (haut)</option>
            </select>
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Annuler</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave} disabled={saving || !form.name || !form.icon}>
            {saving ? '…' : badge ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignBadgeModal({ badgeId, onClose }: { badgeId: string; onClose: () => void }) {
  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const handleAssign = async () => {
    setSaving(true);
    setMsg('');
    try {
      await api(`/api/admin/badges/${badgeId}/assign`, { method: 'POST', body: JSON.stringify({ userId }) });
      setMsg('Badge assigné !');
      setUserId('');
    } catch (e: any) {
      setMsg(e.message);
    }
    setSaving(false);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Assigner le badge</div>
          <button className={styles.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        {msg && <div style={{ fontSize: 13, marginBottom: 12, color: msg.includes('!') ? 'var(--text-positive)' : 'var(--text-danger)' }}>{msg}</div>}
        <div className={styles.field}>
          <div className={styles.fieldLabel}>ID de l'utilisateur</div>
          <input className={styles.fieldInput} value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Snowflake ID" />
        </div>
        <div className={styles.modalActions}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Fermer</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleAssign} disabled={saving || !userId}>
            {saving ? '…' : 'Assigner'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminBadgesPage() {
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBadge, setEditBadge] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [assignBadgeId, setAssignBadgeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const adminLevel = useAuthStore((s) => s.user?.admin_level ?? 0);

  const load = () => {
    setLoading(true);
    api.admin.getBadges<any[]>()
      .then((data) => setBadges(Array.isArray(data) ? data : (data as any).badges ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleAll = () => {
    if (selected.size === badges.length) setSelected(new Set());
    else setSelected(new Set(badges.map((b) => b.id)));
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
      const res = await api.admin.bulkBadges<{ succeeded: number; failed: number }>(action, Array.from(selected));
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
    if (!confirm('Supprimer définitivement ce badge ?')) return;
    try {
      await api(`/api/admin/badges/${id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Badges</div>
          <div className={styles.pageSubtitle}>{badges.length} badge{badges.length !== 1 ? 's' : ''} configuré{badges.length !== 1 ? 's' : ''}</div>
        </div>
        {adminLevel >= 2 && (
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Créer un badge
          </button>
        )}
      </div>

      <div className={styles.tableWrapper}>
        {selected.size > 0 && adminLevel >= 3 && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkBarCount}>{selected.size} sélectionné(s)</span>
            <div className={styles.bulkBarSpacer} />
            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('delete', { confirmText: 'Supprimer définitivement {count} badge(s) ? Cette action est irréversible.' })}>
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
                {adminLevel >= 3 && (
                  <th className={styles.checkboxCell}>
                    <input type="checkbox" checked={selected.size > 0 && selected.size === badges.length} onChange={toggleAll} />
                  </th>
                )}
                <th>Badge</th>
                <th>Nom interne</th>
                <th>Type</th>
                <th>Priorité</th>
                <th>Assignés</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {badges.map((badge) => (
                <tr key={badge.id}>
                  {adminLevel >= 3 && (
                    <td className={styles.checkboxCell}>
                      <input type="checkbox" checked={selected.has(badge.id)} onChange={() => toggleOne(badge.id)} />
                    </td>
                  )}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{badge.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{badge.label || badge.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{badge.description}</div>
                      </div>
                      {badge.color && <span className={styles.colorSwatch} style={{ background: badge.color }} title={badge.color} />}
                    </div>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{badge.name}</td>
                  <td><span className={`${styles.badge} ${badge.type === 'system' ? styles.badgeBlue : badge.type === 'auto' ? styles.badgeGreen : styles.badgeGray}`}>{badge.type}</span></td>
                  <td style={{ color: 'var(--text-muted)' }}>{badge.priority}</td>
                  <td>
                    <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} onClick={() => setAssignBadgeId(badge.id)}>
                      <Users size={13} /> {badge.assigned_count ?? 0}
                    </button>
                  </td>
                  <td>
                    <div className={styles.actionRow}>
                      {adminLevel >= 2 && (
                        <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall} ${styles.btnIcon}`} onClick={() => setEditBadge(badge)}>
                          <Pencil size={13} />
                        </button>
                      )}
                      {adminLevel >= 3 && (
                        <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall} ${styles.btnIcon}`} onClick={() => handleDelete(badge.id)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {badges.length === 0 && (
                <tr><td colSpan={6}><div className={styles.emptyState}>Aucun badge configuré.</div></td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <BadgeFormModal onClose={() => setShowCreate(false)} onSaved={load} />}
      {editBadge && <BadgeFormModal badge={editBadge} onClose={() => setEditBadge(null)} onSaved={load} />}
      {assignBadgeId && <AssignBadgeModal badgeId={assignBadgeId} onClose={() => setAssignBadgeId(null)} />}
    </div>
  );
}
