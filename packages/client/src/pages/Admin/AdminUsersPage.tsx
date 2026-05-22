import { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, UserX, UserCheck, LogOut, KeyRound, Award, X, Eye, Filter, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import styles from './AdminLayout.module.css';

function UserDetailModal({ userId, onClose, adminLevel }: { userId: string; onClose: () => void; adminLevel: number }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [banReason, setBanReason] = useState('');
  const [showBanForm, setShowBanForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPwForm, setShowPwForm] = useState(false);

  useEffect(() => {
    api.get<any>(`/api/admin/users/${userId}`)
      .then(setUser)
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const doAction = async (fn: () => Promise<any>, successMsg: string) => {
    try {
      await fn();
      setMsg(successMsg);
      const updated = await api.get<any>(`/api/admin/users/${userId}`);
      setUser(updated);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  if (loading) return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.loading}>Chargement…</div>
      </div>
    </div>
  );

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalLg}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Détail utilisateur</div>
          <button className={styles.modalClose} onClick={onClose}><X size={18} /></button>
        </div>

        {msg && <div style={{ color: 'var(--text-positive)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>{msg}</div>}

        {user && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div className={styles.avatar} style={{ width: 52, height: 52, fontSize: 20 }}>
                {user.avatar ? <img src={user.avatar} alt="" /> : (user.global_name || user.username).slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{user.global_name || user.username}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{user.username}#{user.discriminator}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{user.email}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {user.admin_level > 0 && <span className={`${styles.badge} ${styles.badgeBlue}`}>Admin {user.admin_level}</span>}
                {user.premium && <span className={`${styles.badge} ${styles.badgeYellow}`}>Premium</span>}
                {user.banned && <span className={`${styles.badge} ${styles.badgeRed}`}>Banni</span>}
                {user.disabled && <span className={`${styles.badge} ${styles.badgeGray}`}>Désactivé</span>}
              </div>
            </div>

            <div className={styles.detailGrid}>
              <div className={styles.detailItem}><div className={styles.detailKey}>ID</div><div className={styles.detailValue} style={{ fontFamily: 'monospace', fontSize: 12 }}>{user.id}</div></div>
              <div className={styles.detailItem}><div className={styles.detailKey}>Créé le</div><div className={styles.detailValue}>{new Date(user.created_at).toLocaleDateString('fr-FR')}</div></div>
              <div className={styles.detailItem}><div className={styles.detailKey}>Dernière connexion</div><div className={styles.detailValue}>{user.last_seen_at ? new Date(user.last_seen_at).toLocaleString('fr-FR') : 'Jamais'}</div></div>
              <div className={styles.detailItem}><div className={styles.detailKey}>2FA</div><div className={styles.detailValue}>{user.mfa_enabled ? '✅ Activé' : '❌ Désactivé'}</div></div>
              <div className={styles.detailItem}><div className={styles.detailKey}>Serveurs</div><div className={styles.detailValue}>{user.guilds?.length ?? 0}</div></div>
              <div className={styles.detailItem}><div className={styles.detailKey}>Sessions actives</div><div className={styles.detailValue}>{user.sessions_count ?? 0}</div></div>
            </div>

            {user.badges?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className={styles.sectionTitle} style={{ marginTop: 0 }}>Badges</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {user.badges.map((b: any) => (
                    <span key={b.id} className={`${styles.badge} ${styles.badgeBlue}`} title={b.description}>
                      {b.icon} {b.label || b.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {adminLevel >= 2 && (
              <div className={styles.actionRow}>
                {!user.banned ? (
                  <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} onClick={() => setShowBanForm(!showBanForm)}>
                    <UserX size={14} /> Bannir
                  </button>
                ) : (
                  <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                    onClick={() => doAction(() => api.post(`/api/admin/users/${userId}/ban`, { reason: banReason }), 'Débanni !')}>
                    <UserCheck size={14} /> Débannir
                  </button>
                )}
                <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                  onClick={() => doAction(() => api.post(`/api/admin/users/${userId}/force-logout`), 'Sessions révoquées !')}>
                  <LogOut size={14} /> Forcer déconnexion
                </button>
                <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} onClick={() => setShowPwForm(!showPwForm)}>
                  <KeyRound size={14} /> Réinitialiser MDP
                </button>
                <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                  onClick={() => doAction(() => api.patch(`/api/admin/users/${userId}`, { disabled: !user.disabled }), user.disabled ? 'Compte réactivé !' : 'Compte désactivé !')}>
                  {user.disabled ? <UserCheck size={14} /> : <UserX size={14} />}
                  {user.disabled ? 'Réactiver' : 'Désactiver'}
                </button>
              </div>
            )}

            {showBanForm && (
              <div style={{ marginTop: 12 }}>
                <input
                  className={styles.fieldInput}
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Raison du bannissement"
                />
                <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} style={{ marginTop: 8 }}
                  onClick={() => doAction(() => api(`/api/admin/users/${userId}/ban`, { method: 'POST', body: JSON.stringify({ reason: banReason }) }), 'Banni !').then(() => setShowBanForm(false))}>
                  Confirmer le ban
                </button>
              </div>
            )}

            {showPwForm && (
              <div style={{ marginTop: 12 }}>
                <input
                  type="password"
                  className={styles.fieldInput}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nouveau mot de passe (min. 8 caractères)"
                />
                <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} style={{ marginTop: 8 }}
                  onClick={() => doAction(() => api(`/api/admin/users/${userId}/reset-password`, { method: 'POST', body: JSON.stringify({ password: newPassword }) }), 'MDP réinitialisé !').then(() => setShowPwForm(false))}>
                  Confirmer
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const adminLevel = useAuthStore((s) => s.user?.admin_level ?? 0);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    api.admin.getUsers<any>({ limit: 50, offset: (page - 1) * 50, search, status: statusFilter || undefined })
      .then((data) => {
        setUsers((data as any).users ?? []);
        setTotal((data as any).total ?? 0);
        setPages(data.pages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setSelected(new Set()); }, [page, search, statusFilter]);

  const selectableIds = useMemo(() => users.filter((u) => u.id !== currentUserId).map((u) => u.id), [users, currentUserId]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (action: string, opts?: { confirmText?: string; reason?: boolean }) => {
    if (selected.size === 0) return;
    const count = selected.size;
    if (opts?.confirmText && !window.confirm(opts.confirmText.replace('{count}', String(count)))) return;
    let reason: string | undefined;
    if (opts?.reason) {
      const r = window.prompt('Raison (optionnelle)');
      if (r === null) return;
      reason = r;
    }
    setBulkBusy(true);
    try {
      const res = await api.admin.bulkUsers<{ succeeded: number; failed: number }>(action, Array.from(selected), reason);
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

  const statusBadge = (user: any) => {
    if (user.banned) return <span className={`${styles.badge} ${styles.badgeRed}`}>Banni</span>;
    if (user.disabled) return <span className={`${styles.badge} ${styles.badgeGray}`}>Désactivé</span>;
    return <span className={`${styles.badge} ${styles.badgeGreen}`}>Actif</span>;
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Utilisateurs</div>
          <div className={styles.pageSubtitle}>{total.toLocaleString()} utilisateurs au total</div>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <div className={styles.tableToolbar}>
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            className={styles.searchInput}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher par nom, email ou ID…"
          />
          <Filter size={14} style={{ color: 'var(--text-muted)' }} />
          <select className={styles.filterSelect} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="banned">Bannis</option>
            <option value="disabled">Désactivés</option>
          </select>
        </div>

        {selected.size > 0 && adminLevel >= 2 && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkBarCount}>{selected.size} sélectionné(s)</span>
            <div className={styles.bulkBarSpacer} />
            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('ban', { confirmText: 'Bannir {count} utilisateur(s) ?', reason: true })}>
              <UserX size={13} /> Bannir
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('unban', { confirmText: 'Débannir {count} utilisateur(s) ?' })}>
              <UserCheck size={13} /> Débannir
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('disable', { confirmText: 'Désactiver {count} compte(s) ?' })}>
              <UserX size={13} /> Désactiver
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('enable', { confirmText: 'Réactiver {count} compte(s) ?' })}>
              <UserCheck size={13} /> Réactiver
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('force-logout', { confirmText: 'Forcer la déconnexion de {count} utilisateur(s) ?' })}>
              <LogOut size={13} /> Déconnecter
            </button>
            {adminLevel >= 3 && (
              <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} disabled={bulkBusy}
                onClick={() => runBulk('delete', { confirmText: 'SUPPRIMER DÉFINITIVEMENT {count} compte(s) ? Cette action est irréversible.', reason: true })}>
                <Trash2 size={13} /> Supprimer
              </button>
            )}
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
                    <input type="checkbox" className={styles.headerCheckbox} checked={allSelected} onChange={toggleAll} aria-label="Sélectionner tous" />
                  </th>
                )}
                <th>Utilisateur</th>
                <th>Email</th>
                <th>Statut</th>
                <th>Niveau admin</th>
                <th>Premium</th>
                <th>Serveurs</th>
                <th>Créé le</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  {adminLevel >= 2 && (
                    <td className={styles.checkboxCell}>
                      <input type="checkbox" className={styles.rowCheckbox}
                        checked={selected.has(user.id)}
                        onChange={() => toggleOne(user.id)}
                        disabled={user.id === currentUserId}
                        aria-label={`Sélectionner ${user.username}`}
                      />
                    </td>
                  )}
                  <td>
                    <div className={styles.userRow}>
                      <div className={styles.avatar}>
                        {user.avatar ? <img src={user.avatar} alt="" /> : (user.global_name || user.username).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className={styles.userName}>{user.global_name || user.username}</div>
                        <div className={styles.userTag}>{user.username}#{user.discriminator}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{user.email}</td>
                  <td>{statusBadge(user)}</td>
                  <td>
                    {user.admin_level > 0
                      ? <span className={`${styles.badge} ${styles.badgeBlue}`}>Niveau {user.admin_level}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td>
                    {user.premium
                      ? <span className={`${styles.badge} ${styles.badgeYellow}`}>Premium</span>
                      : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Non</span>}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{user.guild_count ?? 0}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(user.created_at).toLocaleDateString('fr-FR')}</td>
                  <td>
                    <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} onClick={() => setDetailId(user.id)}>
                      <Eye size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={adminLevel >= 2 ? 9 : 8}><div className={styles.emptyState}>Aucun utilisateur trouvé.</div></td></tr>
              )}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <div className={styles.tablePagination}>
            <span>Page {page} / {pages} — {total} résultats</span>
            <div className={styles.paginationBtns}>
              <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Préc.</button>
              <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Suiv.</button>
            </div>
          </div>
        )}
      </div>

      {detailId && <UserDetailModal userId={detailId} onClose={() => { setDetailId(null); load(); }} adminLevel={adminLevel} />}
    </div>
  );
}
