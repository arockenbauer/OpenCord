import { useEffect, useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import styles from './AdminLayout.module.css';

interface PlatformSettings {
  registration_enabled: boolean;
  invite_only: boolean;
  max_file_size_mb: number;
  default_locale: string;
  maintenance_mode: boolean;
  max_guilds_per_user: number;
  max_members_per_guild: number;
  message_retention_days: number | null;
}

const LOCALES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' },
  { value: 'pt-BR', label: 'Português (BR)' },
  { value: 'ja', label: '日本語' },
  { value: 'zh-CN', label: '中文 (简体)' },
  { value: 'ko', label: '한국어' },
  { value: 'ru', label: 'Русский' },
];

export function AdminSettingsPage() {
  const adminLevel = useAuthStore((s) => s.user?.admin_level ?? 0);
  const [form, setForm] = useState<PlatformSettings | null>(null);
  const [original, setOriginal] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const load = () => {
    setLoading(true);
    api.admin.getSettings<PlatformSettings>()
      .then((data) => {
        setForm(data);
        setOriginal(data);
      })
      .catch((e: any) => setMsg({ text: e.message, error: true }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setMsg(null);
    try {
      const updated: PlatformSettings = await api.admin.updateSettings<PlatformSettings>(form);
      setForm(updated);
      setOriginal(updated);
      setMsg({ text: 'Paramètres enregistrés avec succès.', error: false });
    } catch (e: any) {
      setMsg({ text: e.message, error: true });
    }
    setSaving(false);
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(original);
  const canEdit = adminLevel >= 2;

  const set = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Paramètres globaux</div>
          <div className={styles.pageSubtitle}>Configuration de la plateforme OpenCord</div>
        </div>
        {canEdit && (
          <div className={styles.actionRow}>
            <button
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={load}
              disabled={loading || saving}
            >
              <RefreshCw size={15} /> Actualiser
            </button>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleSave}
              disabled={saving || !isDirty || loading}
            >
              <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}
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

      {loading ? (
        <div className={styles.loading}>Chargement…</div>
      ) : form && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>

          {/* Access & Registration */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Accès &amp; Inscription
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Inscriptions ouvertes</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
                    Permet aux nouveaux utilisateurs de créer un compte
                  </div>
                </div>
                <label className={canEdit ? styles.toggle : ''} style={!canEdit ? { pointerEvents: 'none' } : {}}>
                  <input
                    type="checkbox"
                    checked={form.registration_enabled}
                    onChange={(e) => set('registration_enabled', e.target.checked)}
                    disabled={!canEdit}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Mode invitation uniquement</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
                    Les nouveaux comptes nécessitent un code d'invitation
                  </div>
                </div>
                <label className={canEdit ? styles.toggle : ''} style={!canEdit ? { pointerEvents: 'none' } : {}}>
                  <input
                    type="checkbox"
                    checked={form.invite_only}
                    onChange={(e) => set('invite_only', e.target.checked)}
                    disabled={!canEdit}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Mode maintenance</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
                    Empêche toute connexion (sauf les admins)
                  </div>
                </div>
                <label className={canEdit ? styles.toggle : ''} style={!canEdit ? { pointerEvents: 'none' } : {}}>
                  <input
                    type="checkbox"
                    checked={form.maintenance_mode}
                    onChange={(e) => set('maintenance_mode', e.target.checked)}
                    disabled={!canEdit}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>
            </div>
          </div>

          {/* Limits */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Limites
            </div>
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className={styles.field} style={{ marginBottom: 0 }}>
                <div className={styles.fieldLabel}>Taille max des fichiers (Mo)</div>
                <input
                  type="number"
                  className={styles.fieldInput}
                  value={form.max_file_size_mb}
                  min={1}
                  max={500}
                  onChange={(e) => set('max_file_size_mb', Number(e.target.value))}
                  disabled={!canEdit}
                />
              </div>

              <div className={styles.field} style={{ marginBottom: 0 }}>
                <div className={styles.fieldLabel}>Serveurs max par utilisateur</div>
                <input
                  type="number"
                  className={styles.fieldInput}
                  value={form.max_guilds_per_user}
                  min={1}
                  max={1000}
                  onChange={(e) => set('max_guilds_per_user', Number(e.target.value))}
                  disabled={!canEdit}
                />
              </div>

              <div className={styles.field} style={{ marginBottom: 0 }}>
                <div className={styles.fieldLabel}>Membres max par serveur</div>
                <input
                  type="number"
                  className={styles.fieldInput}
                  value={form.max_members_per_guild}
                  min={2}
                  max={1000000}
                  onChange={(e) => set('max_members_per_guild', Number(e.target.value))}
                  disabled={!canEdit}
                />
              </div>

              <div className={styles.field} style={{ marginBottom: 0 }}>
                <div className={styles.fieldLabel}>Rétention des messages (jours, vide = infini)</div>
                <input
                  type="number"
                  className={styles.fieldInput}
                  value={form.message_retention_days ?? ''}
                  min={1}
                  placeholder="Indéfini"
                  onChange={(e) => set('message_retention_days', e.target.value ? Number(e.target.value) : null)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>

          {/* Locale */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Localisation
            </div>
            <div style={{ padding: '20px' }}>
              <div className={styles.field} style={{ marginBottom: 0, maxWidth: 320 }}>
                <div className={styles.fieldLabel}>Langue par défaut</div>
                <select
                  className={styles.fieldSelect}
                  value={form.default_locale}
                  onChange={(e) => set('default_locale', e.target.value)}
                  disabled={!canEdit}
                >
                  {LOCALES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!canEdit && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
              Niveau admin 2 requis pour modifier ces paramètres.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
