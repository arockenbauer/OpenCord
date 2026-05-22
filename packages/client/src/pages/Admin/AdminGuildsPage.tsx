import { useEffect, useState, useCallback } from 'react';
import { Search, Trash2, Eye, X, Sliders } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import styles from './AdminLayout.module.css';

function GuildDetailModal({ guildId, onClose, onDeleted, adminLevel }: { guildId: string; onClose: () => void; onDeleted: () => void; adminLevel: number }) {
  const [guild, setGuild] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [features, setFeatures] = useState<string[]>([]);

  useEffect(() => {
    api<any>(`/api/admin/guilds/${guildId}`)
      .then((g) => { setGuild(g); setFeatures(g.features || []); })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [guildId]);

  const handleDeleteGuild = async () => {
    if (!confirm('Supprimer définitivement ce serveur ? Cette action est irréversible.')) return;
    try {
      await api(`/api/admin/guilds/${guildId}`, { method: 'DELETE' });
      onDeleted();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const handleSaveFeatures = async () => {
    try {
      await api(`/api/admin/guilds/${guildId}`, { method: 'PATCH', body: JSON.stringify({ features }) });
      setMsg('Fonctionnalités mises à jour !');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const toggleFeature = (f: string) => {
    setFeatures((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);
  };

  const availableFeatures = ['COMMUNITY', 'PARTNERED', 'VERIFIED', 'VANITY_URL', 'ANIMATED_ICON', 'NEWS', 'MONETIZATION_ENABLED', 'ROLE_SUBSCRIPTIONS_ENABLED'];

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalLg}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Détail du serveur</div>
          <button className={styles.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        {msg && <div style={{ color: 'var(--text-positive)', fontSize: 13, marginBottom: 12 }}>{msg}</div>}
        {loading ? <div className={styles.loading}>Chargement…</div> : guild && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div className={styles.avatar} style={{ width: 52, height: 52, fontSize: 20, borderRadius: 12 }}>
                {guild.icon ? <img src={guild.icon} alt="" style={{ borderRadius: 12 }} /> : guild.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{guild.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Owner: {guild.owner?.username}#{guild.owner?.discriminator}</div>
              </div>
            </div>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}><div className={styles.detailKey}>ID</div><div className={styles.detailValue} style={{ fontFamily: 'monospace', fontSize: 12 }}>{guild.id}</div></div>
              <div className={styles.detailItem}><div className={styles.detailKey}>Membres</div><div className={styles.detailValue}>{guild.member_count}</div></div>
              <div className={styles.detailItem}><div className={styles.detailKey}>Salons</div><div className={styles.detailValue}>{guild.channel_count}</div></div>
              <div className={styles.detailItem}><div className={styles.detailKey}>Rôles</div><div className={styles.detailValue}>{guild.role_count}</div></div>
              <div className={styles.detailItem}><div className={styles.detailKey}>Boosts</div><div className={styles.detailValue}>{guild.boost_count} (tier {guild.boost_tier})</div></div>
              <div className={styles.detailItem}><div className={styles.detailKey}>Créé le</div><div className={styles.detailValue}>{new Date(guild.created_at).toLocaleDateString('fr-FR')}</div></div>
            </div>
            {guild.description && <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>{guild.description}</div>}

            {adminLevel >= 2 && (
              <>
                <div className={styles.sectionTitle} style={{ marginTop: 0 }}>Fonctionnalités du serveur</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {availableFeatures.map((f) => (
                    <button key={f}
                      onClick={() => toggleFeature(f)}
                      className={`${styles.badge} ${features.includes(f) ? styles.badgeBlue : styles.badgeGray}`}
                      style={{ cursor: 'pointer', border: 'none', fontSize: 12 }}>
                      {f}
                    </button>
                  ))}
                </div>
                <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`} onClick={handleSaveFeatures}>
                  <Sliders size={13} /> Enregistrer les features
                </button>
              </>
            )}

            {adminLevel >= 2 && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleDeleteGuild}>
                  <Trash2 size={14} /> Supprimer le serveur
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AdminGuildsPage() {
  const [guilds, setGuilds] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const adminLevel = useAuthStore((s) => s.user?.admin_level ?? 0);

  const load = useCallback(() => {
    setLoading(true);
    api.admin.getGuilds<any>({ limit: 50, offset: (page - 1) * 50, search })
      .then((data) => { setGuilds((data as any).guilds ?? []); setTotal((data as any).total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setSelected(new Set()); }, [page, search]);

  const toggleAll = () => {
    if (selected.size === guilds.length) setSelected(new Set());
    else setSelected(new Set(guilds.map((g) => g.id)));
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
      const res = await api.admin.bulkGuilds<{ succeeded: number; failed: number }>(action, Array.from(selected), reason);
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

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Serveurs</div>
          <div className={styles.pageSubtitle}>{total.toLocaleString()} serveur{total !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <div className={styles.tableToolbar}>
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input className={styles.searchInput} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Rechercher par nom…" />
        </div>

        {selected.size > 0 && adminLevel >= 2 && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkBarCount}>{selected.size} sélectionné(s)</span>
            <div className={styles.bulkBarSpacer} />
            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} disabled={bulkBusy}
              onClick={() => runBulk('delete', { confirmText: 'Supprimer définitivement {count} serveur(s) ? Cette action est irréversible.', reason: true })}>
              <Trash2 size={13} /> Supprimer
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
                    <input type="checkbox" checked={selected.size > 0 && selected.size === guilds.length} onChange={toggleAll} />
                  </th>
                )}
                <th>Serveur</th>
                <th>Propriétaire</th>
                <th>Membres</th>
                <th>Tier boost</th>
                <th>Fonctionnalités</th>
                <th>Créé le</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {guilds.map((g) => (
                <tr key={g.id}>
                  {adminLevel >= 2 && (
                    <td className={styles.checkboxCell}>
                      <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleOne(g.id)} />
                    </td>
                  )}
                  <td>
                    <div className={styles.userRow}>
                      <div className={styles.avatar} style={{ borderRadius: 12 }}>
                        {g.icon ? <img src={g.icon} alt="" style={{ borderRadius: 12 }} /> : g.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className={styles.userName}>{g.name}</div>
                        <div className={styles.userTag} style={{ fontFamily: 'monospace', fontSize: 11 }}>{g.id.slice(0, 10)}…</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{g.owner?.username}#{g.owner?.discriminator}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{g.member_count?.toLocaleString()}</td>
                  <td>{g.boost_tier > 0 ? <span className={`${styles.badge} ${styles.badgePurple}`}>Tier {g.boost_tier}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(g.features || []).slice(0, 3).map((f: string) => (
                        <span key={f} className={`${styles.badge} ${styles.badgeGray}`} style={{ fontSize: 10 }}>{f}</span>
                      ))}
                      {(g.features || []).length > 3 && <span className={`${styles.badge} ${styles.badgeGray}`} style={{ fontSize: 10 }}>+{g.features.length - 3}</span>}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(g.created_at).toLocaleDateString('fr-FR')}</td>
                  <td>
                    <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} onClick={() => setDetailId(g.id)}>
                      <Eye size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {guilds.length === 0 && <tr><td colSpan={7}><div className={styles.emptyState}>Aucun serveur trouvé.</div></td></tr>}
            </tbody>
          </table>
        )}
        <div className={styles.tablePagination}>
          <span>Page {page} — {total} résultats</span>
          <div className={styles.paginationBtns}>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Préc.</button>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`} disabled={guilds.length < 50} onClick={() => setPage(p => p + 1)}>Suiv.</button>
          </div>
        </div>
      </div>

      {detailId && <GuildDetailModal guildId={detailId} onClose={() => setDetailId(null)} onDeleted={() => { setDetailId(null); load(); }} adminLevel={adminLevel} />}
    </div>
  );
}
