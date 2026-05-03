import { useState, useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../../utils/i18n';
import { Modal } from '../../components/Modal/Modal';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { api } from '../../services/api';
import { applyClientPluginPreferences, buildDefaultPluginSettings, parsePluginSchema } from '../../utils/plugins';
import styles from './UserSettingsPage.module.css';

type Section = 'account' | 'profile' | 'privacy' | 'appearance' | 'language' | 'two_factor' | 'sessions' | 'notifications' | 'keybinds' | 'streamer' | 'data' | 'connections' | 'applications' | 'plugins' | 'activities' | 'my-boosts';

interface UnsavedDialog {
  pendingSection: Section;
}

export function UserSettingsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const setShowUserSettings = useUIStore((s) => s.setShowUserSettings);
  const [section, setSection] = useState<Section>('account');
  const [unsavedDialog, setUnsavedDialog] = useState<UnsavedDialog | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  useEffect(() => {
    if (user?.theme) document.documentElement.dataset.theme = user.theme;
  }, [user?.theme]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsaved]);

  const handleNavigate = useCallback((nextSection: Section) => {
    if (nextSection === section) return;
    if (hasUnsaved) {
      setUnsavedDialog({ pendingSection: nextSection });
    } else {
      setSection(nextSection);
    }
  }, [hasUnsaved, section]);

  const discardAndNavigate = useCallback(() => {
    setHasUnsaved(false);
    setSection(unsavedDialog!.pendingSection);
    setUnsavedDialog(null);
  }, [unsavedDialog]);

  if (!user) return null;

  return (
    <Modal onClose={() => setShowUserSettings(false)} contentClassName={styles.modal}>
      {unsavedDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 99999,
        }}>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: '8px', padding: '24px',
            maxWidth: '400px', width: '90%', boxShadow: 'var(--shadow-high)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Enregistrer les modifications ?</div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Vous avez des modifications non enregistrées. Quittez sans enregistrer ?
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setUnsavedDialog(null)}
                style={{ padding: '8px 16px', borderRadius: '4px', background: 'var(--bg-modifier-hover)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={discardAndNavigate}
                style={{ padding: '8px 16px', borderRadius: '4px', background: 'var(--bg-accent)', color: 'white', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                Quitter sans enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarInner}>
            <div className={styles.sectionTitle}>{t('user.settings')}</div>
            <button className={`${styles.menuItem} ${section === 'account' ? styles.active : ''}`} onClick={() => handleNavigate('account')}>{t('user.account')}</button>
            <button className={`${styles.menuItem} ${section === 'profile' ? styles.active : ''}`} onClick={() => handleNavigate('profile')}>{t('user.profile')}</button>
            <button className={`${styles.menuItem} ${section === 'privacy' ? styles.active : ''}`} onClick={() => handleNavigate('privacy')}>Confidentialité</button>
            <button className={`${styles.menuItem} ${section === 'appearance' ? styles.active : ''}`} onClick={() => handleNavigate('appearance')}>{t('user.appearance')}</button>
            <button className={`${styles.menuItem} ${section === 'language' ? styles.active : ''}`} onClick={() => handleNavigate('language')}>{t('user.language')}</button>
            <button className={`${styles.menuItem} ${section === 'two_factor' ? styles.active : ''}`} onClick={() => handleNavigate('two_factor')}>{t('user.two_factor')}</button>
            <button className={`${styles.menuItem} ${section === 'sessions' ? styles.active : ''}`} onClick={() => handleNavigate('sessions')}>{t('user.sessions')}</button>
            <div className={styles.divider} />
            <div className={styles.sectionTitle}>Paramètres avancés</div>
            <button className={`${styles.menuItem} ${section === 'notifications' ? styles.active : ''}`} onClick={() => handleNavigate('notifications')}>Notifications</button>
            <button className={`${styles.menuItem} ${section === 'keybinds' ? styles.active : ''}`} onClick={() => handleNavigate('keybinds')}>Raccourcis</button>
            <button className={`${styles.menuItem} ${section === 'streamer' ? styles.active : ''}`} onClick={() => handleNavigate('streamer')}>Mode streamer</button>
            <button className={`${styles.menuItem} ${section === 'data' ? styles.active : ''}`} onClick={() => handleNavigate('data')}>Données</button>
            <button className={`${styles.menuItem} ${section === 'connections' ? styles.active : ''}`} onClick={() => handleNavigate('connections')}>Connexions</button>
            <button className={`${styles.menuItem} ${section === 'applications' ? styles.active : ''}`} onClick={() => handleNavigate('applications')}>Applications</button>
            <button className={`${styles.menuItem} ${section === 'plugins' ? styles.active : ''}`} onClick={() => handleNavigate('plugins')}>Plugins</button>
            <button className={`${styles.menuItem} ${section === 'activities' ? styles.active : ''}`} onClick={() => handleNavigate('activities')}>Activités</button>
            <button className={`${styles.menuItem} ${section === 'my-boosts' ? styles.active : ''}`} onClick={() => handleNavigate('my-boosts')}>Mes Boosts</button>
            <button className={`${styles.menuItem} ${styles.danger}`} onClick={logout}>{t('auth.logout')}</button>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.contentInner}>
            {section === 'account' && <AccountSection user={user} />}
            {section === 'profile' && <ProfileSection user={user} updateUser={updateUser} setHasUnsaved={setHasUnsaved} />}
            {section === 'privacy' && <PrivacySection user={user} updateUser={updateUser} setHasUnsaved={setHasUnsaved} />}
            {section === 'appearance' && <AppearanceSection user={user} updateUser={updateUser} setHasUnsaved={setHasUnsaved} />}
            {section === 'language' && <LanguageSection user={user} updateUser={updateUser} />}
            {section === 'two_factor' && <TwoFactorSection user={user} />}
            {section === 'sessions' && <SessionsSection />}
            {section === 'notifications' && <NotificationsSection />}
            {section === 'keybinds' && <KeybindsSection />}
            {section === 'streamer' && <StreamerModeSection user={user} updateUser={updateUser} />}
            {section === 'data' && <DataSection />}
            {section === 'connections' && <ConnectionsSection />}
            {section === 'applications' && <ApplicationsSection />}
            {section === 'plugins' && <PluginsSection />}
            {section === 'activities' && <ActivitiesSection user={user} />}
            {section === 'my-boosts' && <MyBoostsSection />}
          </div>
          <div className={styles.closeWrapper} onClick={() => setShowUserSettings(false)}>
            <div className={styles.close}>
              <X size={18} />
            </div>
            <span className={styles.closeEsc}>ESC</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AccountSection({ user }: { user: any }) {
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const [editField, setEditField] = useState<string | null>(null);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSaveField = async (field: string) => {
    setSaving(true);
    setMessage('');
    try {
      const payload: Record<string, string> = { password: currentPassword };
      if (field === 'username') payload.username = username;
      if (field === 'email') payload.email = email;
      await updateUser(payload);
      setEditField(null);
      setCurrentPassword('');
      setMessage('Enregistré !');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setMessage(err.message || 'Erreur');
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { setMessage('Les mots de passe ne correspondent pas.'); return; }
    if (newPassword.length < 8) { setMessage('Le mot de passe doit faire au moins 8 caractères.'); return; }
    setSaving(true);
    setMessage('');
    try {
      await api('/api/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({ old_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Mot de passe modifié !');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setMessage(err.message || 'Erreur');
    }
    setSaving(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== user.username) {
      setMessage(`Tapez "${user.username}" pour confirmer.`);
      return;
    }
    if (!deletePassword) {
      setMessage('Entrez votre mot de passe pour supprimer le compte.');
      return;
    }

    setDeleteLoading(true);
    setMessage('');
    try {
      await api.users.deleteMe({ password: deletePassword });
      await logout();
    } catch (err: any) {
      setMessage(err.message || 'Erreur');
    }
    setDeleteLoading(false);
  };

  const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)', marginTop: '6px' };

  return (
    <div>
      <div className={styles.pageTitle}>Mon compte</div>
      {message && <div style={{ fontSize: '14px', marginBottom: '12px', color: message.includes('Erreur') || message.includes('correspondent') || message.includes('caractères') ? 'var(--text-danger)' : 'var(--text-positive)' }}>{message}</div>}
      <div className={styles.card}>
        <div className={styles.cardRow}>
          <div style={{ flex: 1 }}>
            <div className={styles.cardLabel}>Nom d'utilisateur</div>
            {editField === 'username' ? (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} />
                <input type="password" style={inputStyle} placeholder="Mot de passe actuel" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className={styles.editButton} onClick={() => handleSaveField('username')} disabled={saving}>Enregistrer</button>
                  <button className={styles.editButton} style={{ background: 'transparent' }} onClick={() => { setEditField(null); setUsername(user.username); setCurrentPassword(''); }}>Annuler</button>
                </div>
              </div>
            ) : (
              <div className={styles.cardValue}>{user.username}#{user.discriminator}</div>
            )}
          </div>
          {editField !== 'username' && <button className={styles.editButton} onClick={() => setEditField('username')}>Modifier</button>}
        </div>
        <div className={styles.cardRow}>
          <div style={{ flex: 1 }}>
            <div className={styles.cardLabel}>Email</div>
            {editField === 'email' ? (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
                <input type="password" style={inputStyle} placeholder="Mot de passe actuel" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className={styles.editButton} onClick={() => handleSaveField('email')} disabled={saving}>Enregistrer</button>
                  <button className={styles.editButton} style={{ background: 'transparent' }} onClick={() => { setEditField(null); setEmail(user.email || ''); setCurrentPassword(''); }}>Annuler</button>
                </div>
              </div>
            ) : (
              <div className={styles.cardValue}>{user.email || '—'}</div>
            )}
          </div>
          {editField !== 'email' && <button className={styles.editButton} onClick={() => setEditField('email')}>Modifier</button>}
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: '16px' }}>
        <div className={styles.cardLabel} style={{ marginBottom: '12px' }}>Changer de mot de passe</div>
        <input type="password" style={inputStyle} placeholder="Mot de passe actuel" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <input type="password" style={{ ...inputStyle, marginTop: '8px' }} placeholder="Nouveau mot de passe" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <input type="password" style={{ ...inputStyle, marginTop: '8px' }} placeholder="Confirmer le nouveau mot de passe" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        <button className={styles.editButton} style={{ marginTop: '12px' }} onClick={handleChangePassword} disabled={saving || !currentPassword || !newPassword}>
          {saving ? '...' : 'Changer le mot de passe'}
        </button>
      </div>

      <div className={styles.card} style={{ marginTop: '16px', border: '1px solid rgba(237, 66, 69, 0.35)' }}>
        <div className={styles.cardLabel} style={{ marginBottom: '12px', color: 'var(--text-danger)' }}>Zone dangereuse</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Cette action est irréversible. Vous devez d’abord quitter ou transférer les serveurs dont vous êtes propriétaire.
        </div>
        <input type="password" style={inputStyle} placeholder="Mot de passe actuel" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
        <input
          type="text"
          style={{ ...inputStyle, marginTop: '8px' }}
          placeholder={`Tapez ${user.username} pour confirmer`}
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
        />
        <button
          className={styles.editButton}
          style={{ marginTop: '12px', background: 'var(--danger)', color: 'white' }}
          onClick={handleDeleteAccount}
          disabled={deleteLoading || !deletePassword || !deleteConfirm}
        >
          {deleteLoading ? 'Suppression…' : 'Supprimer le compte'}
        </button>
      </div>
    </div>
  );
}

function ProfileSection({ user, updateUser, setHasUnsaved }: { user: any; updateUser: (data: any) => Promise<void>; setHasUnsaved?: (v: boolean) => void }) {
  const [bio, setBio] = useState(user.bio || '');
  const [globalName, setGlobalName] = useState(user.global_name || '');
  const [pronouns, setPronouns] = useState(user.pronouns || '');
  const [bannerColor, setBannerColor] = useState(user.banner_color || '#5865f2');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar || null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setHasUnsaved?.(true);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = { bio, global_name: globalName || null, pronouns: pronouns || null, banner_color: bannerColor };
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        try {
          const data = await api.patch<{ avatar: string }>('/api/users/@me/avatar', formData);
          if (data.avatar) { setAvatarPreview(data.avatar); updateUser({ avatar: data.avatar }); }
        } catch { updateUser({ avatar: user.avatar }); }
      }
      await updateUser(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* handled */ }
    setSaving(false);
    setHasUnsaved?.(false);
  };

  const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)' };

  return (
    <div>
      <div className={styles.pageTitle}>Profil</div>
      <div className={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <div
            style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: avatarPreview ? 'pointer' : 'default', fontSize: '28px', fontWeight: 700, color: 'white', flexShrink: 0 }}
            onClick={() => { if (avatarPreview) setAvatarExpanded(true); else fileInputRef.current?.click(); }}
            title={avatarPreview ? 'Agrandir' : undefined}
          >
            {avatarPreview ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (user.global_name || user.username).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <button className={styles.editButton} onClick={() => fileInputRef.current?.click()}>Changer l'avatar</button>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>JPG, PNG, GIF, WebP. 8 Mo max.</div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <div className={styles.cardLabel}>Nom d'affichage</div>
          <input style={inputStyle} value={globalName} onChange={(e) => { setGlobalName(e.target.value); setHasUnsaved?.(true); }} placeholder={user.username} />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <div className={styles.cardLabel}>Pronoms</div>
          <input style={inputStyle} value={pronouns} onChange={(e) => { setPronouns(e.target.value); setHasUnsaved?.(true); }} placeholder="ils/elles, il/lui, elle/elle…" />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <div className={styles.cardLabel}>Bio</div>
          <textarea
            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }}
            value={bio}
            onChange={(e) => { setBio(e.target.value); setHasUnsaved?.(true); }}
            maxLength={user.premium ? 4000 : 190}
          />
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
            {bio.length}/{user.premium ? '4000' : '190'}
            {!user.premium && <span style={{ marginLeft: '4px', color: 'var(--premium)' }}>OpenCord+ requis pour plus</span>}
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div className={styles.cardLabel}>Couleur de bannière</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
            <input type="color" value={bannerColor} onChange={(e) => { setBannerColor(e.target.value); setHasUnsaved?.(true); }} style={{ width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', border: 'none' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{bannerColor}</span>
          </div>
        </div>
        <button className={styles.editButton} onClick={handleSave} disabled={saving}>
          {saving ? '...' : saved ? 'Enregistré !' : 'Enregistrer'}
        </button>
      </div>
      {avatarExpanded && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'pointer' }}
          onClick={() => setAvatarExpanded(false)}
        >
          <img src={avatarPreview!} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px', objectFit: 'contain' }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function AppearanceSection({ user, updateUser, setHasUnsaved }: { user: any; updateUser: (data: any) => Promise<void>; setHasUnsaved?: (v: boolean) => void }) {
  const [status, setStatus] = useState(user.status || 'online');
  const [customStatus, setCustomStatus] = useState(user.custom_status_text || '');
  const [theme, setTheme] = useState<'dark' | 'light' | 'amoled'>((user.theme as 'dark' | 'light' | 'amoled') || 'dark');
  const [fontSize, setFontSize] = useState(user.font_size || 14);
  const [compact, setCompact] = useState(user.compact_mode || false);

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    setHasUnsaved?.(true);
    await updateUser({ status: newStatus });
    setHasUnsaved?.(false);
  };

  const handleCustomStatusSave = async () => {
    setHasUnsaved?.(true);
    await updateUser({ custom_status_text: customStatus || null });
    setHasUnsaved?.(false);
  };

  const handleThemeChange = async (newTheme: 'dark' | 'light' | 'amoled') => {
    setTheme(newTheme);
    setHasUnsaved?.(true);
    document.documentElement.dataset.theme = newTheme;
    await updateUser({ theme: newTheme });
    setHasUnsaved?.(false);
  };

  const handleFontSizeChange = async (newSize: number) => {
    setFontSize(newSize);
    setHasUnsaved?.(true);
    document.documentElement.style.fontSize = `${newSize}px`;
    await updateUser({ font_size: newSize });
    setHasUnsaved?.(false);
  };

  const handleCompactToggle = async () => {
    const next = !compact;
    setCompact(next);
    setHasUnsaved?.(true);
    await updateUser({ compact_mode: next });
    setHasUnsaved?.(false);
  };

  const statuses = [
    { value: 'online', label: 'En ligne', color: 'var(--status-online)' },
    { value: 'idle', label: 'Absent', color: 'var(--status-idle)' },
    { value: 'dnd', label: 'Ne pas déranger', color: 'var(--status-dnd)' },
    { value: 'invisible', label: 'Invisible', color: 'var(--status-offline)' },
  ];

  return (
    <div>
      <div className={styles.pageTitle}>Apparence</div>

      <div className={styles.card}>
        <div className={styles.cardLabel} style={{ marginBottom: '12px' }}>Thème</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {(['dark', 'light', 'amoled'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleThemeChange(t)}
              style={{
                flex: 1, padding: '16px 12px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', textAlign: 'center',
                background: theme === t ? 'var(--bg-accent)' : 'var(--bg-tertiary)',
                color: theme === t ? 'white' : 'var(--text-muted)',
                border: theme === t ? '2px solid var(--bg-accent)' : '2px solid transparent',
                transition: 'all 150ms',
              }}
            >
              {t === 'dark' ? '🌙 Sombre' : t === 'light' ? '☀️ Clair' : '✨ AMOLED'}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel} style={{ marginBottom: '12px' }}>Taille de police</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>12px</span>
          <input
            type="range"
            min="12"
            max="20"
            value={fontSize}
            onChange={(e) => handleFontSizeChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--bg-accent)' }}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>20px</span>
          <span style={{ fontSize: '14px', fontWeight: 600, minWidth: '40px', textAlign: 'right' }}>{fontSize}px</span>
        </div>
      </div>

      <div className={styles.card}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Mode compact</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Réduit la taille des messages</div>
          </div>
          <input type="checkbox" checked={compact} onChange={handleCompactToggle} style={{ width: '18px', height: '18px' }} />
        </label>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>Statut</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          {statuses.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px',
                borderRadius: '4px', textAlign: 'left',
                background: status === s.value ? 'var(--bg-modifier-selected)' : 'transparent',
              }}
            >
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>Statut personnalisé</div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <input
            style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)' }}
            value={customStatus}
            onChange={(e) => setCustomStatus(e.target.value)}
            placeholder="Que faites-vous ?"
            maxLength={128}
          />
          <button className={styles.editButton} onClick={handleCustomStatusSave}>OK</button>
        </div>
      </div>
    </div>
  );
}

function PrivacySection({ user, updateUser, setHasUnsaved }: { user: any; updateUser: (data: any) => Promise<void>; setHasUnsaved?: (v: boolean) => void }) {
  const [allowFriendRequests, setAllowFriendRequests] = useState(user.allow_friend_requests !== false);
  const [allowDmsFromServers, setAllowDmsFromServers] = useState(user.allow_dms_from_servers !== false);
  const [explicitContentFilter, setExplicitContentFilter] = useState(user.explicit_content_filter ?? 0);
  const [saving, setSaving] = useState(false);

  const handleToggle = async (field: string, value: boolean) => {
    setHasUnsaved?.(true);
    try {
      await updateUser({ [field]: value });
    } catch { /* handled */ }
    setHasUnsaved?.(false);
  };

  const handleFilterChange = async (val: number) => {
    setExplicitContentFilter(val);
    setHasUnsaved?.(true);
    await updateUser({ explicit_content_filter: val });
    setHasUnsaved?.(false);
  };

  const filterOptions = [
    { value: 0, label: 'Désactivé', desc: 'Ne pas analyser le contenu' },
    { value: 1, label: 'Amis seulement', desc: 'Analyser uniquement les messages des amis' },
    { value: 2, label: 'Tous', desc: 'Analyser tous les messages' },
  ];

  return (
    <div>
      <div className={styles.pageTitle}>Confidentialité</div>

      <div className={styles.card}>
        <div className={styles.cardLabel} style={{ marginBottom: '12px' }}>Filtre de contenu explicite</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFilterChange(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px',
                borderRadius: '4px', textAlign: 'left',
                background: explicitContentFilter === opt.value ? 'var(--bg-modifier-selected)' : 'transparent',
              }}
            >
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: explicitContentFilter === opt.value ? 'var(--bg-accent)' : 'var(--text-muted)' }} />
              <div>
                <div style={{ fontSize: '14px' }}>{opt.label}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Demandes d'amis</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Autoriser les autres à vous envoyer des demandes d'amis</div>
          </div>
          <input
            type="checkbox"
            checked={allowFriendRequests}
            disabled={saving}
            onChange={(e) => {
              setAllowFriendRequests(e.target.checked);
              handleToggle('allow_friend_requests', e.target.checked);
            }}
            style={{ width: '18px', height: '18px' }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Messages directs depuis les serveurs</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Autoriser les membres de vos serveurs à vous envoyer des messages directs</div>
          </div>
          <input
            type="checkbox"
            checked={allowDmsFromServers}
            disabled={saving}
            onChange={(e) => {
              setAllowDmsFromServers(e.target.checked);
              handleToggle('allow_dms_from_servers', e.target.checked);
            }}
            style={{ width: '18px', height: '18px' }}
          />
        </label>
      </div>
    </div>
  );
}

function LanguageSection({ user, updateUser }: { user: any; updateUser: (data: any) => Promise<void> }) {
  const [locale, setLocale] = useState(user.locale || 'fr');

  const handleChange = async (newLocale: string) => {
    setLocale(newLocale);
    i18n.changeLanguage(newLocale);
    localStorage.setItem('locale', newLocale);
    await updateUser({ locale: newLocale });
  };

  return (
    <div>
      <div className={styles.pageTitle}>Langue</div>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Langue de l'interface</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          {[{ code: 'fr', label: 'Français' }, { code: 'en', label: 'English' }].map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleChange(lang.code)}
              style={{
                padding: '8px 12px', borderRadius: '4px', textAlign: 'left',
                background: locale === lang.code ? 'var(--bg-modifier-selected)' : 'transparent',
              }}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TwoFactorSection({ user }: { user: any }) {
  const [password, setPassword] = useState('');
  const [qrData, setQrData] = useState<any>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  const handleEnable = async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await api('/api/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setQrData(data);
      setPassword('');
    } catch (err: any) {
      setMessage(err.message);
    }
    setLoading(false);
  };

  const handleVerify = async () => {
    setLoading(true);
    setMessage('');
    try {
      await api('/api/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setMessage('2FA activée avec succès !');
      setQrData(null);
      setCode('');
      await fetchMe();
    } catch (err: any) {
      setMessage(err.message);
    }
    setLoading(false);
  };

  const handleDisable = async () => {
    if (!password) return;
    setLoading(true);
    setMessage('');
    try {
      await api('/api/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setMessage('2FA désactivée.');
      setPassword('');
      await fetchMe();
    } catch (err: any) {
      setMessage(err.message);
    }
    setLoading(false);
  };

  return (
    <div>
      <div className={styles.pageTitle}>Authentification à deux facteurs</div>
      {message && <div style={{ color: 'var(--text-positive)', fontSize: '14px', marginBottom: '16px' }}>{message}</div>}

      {user.two_factor_enabled ? (
        <div className={styles.card}>
          <div style={{ marginBottom: '12px', color: 'var(--text-positive)' }}>2FA est activée sur votre compte.</div>
          <div className={styles.cardLabel}>Mot de passe pour désactiver</div>
          <input
            type="password"
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)', marginTop: '8px', marginBottom: '12px' }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className={styles.editButton} style={{ background: 'var(--danger)', color: 'white' }} onClick={handleDisable} disabled={loading}>
            Désactiver 2FA
          </button>
        </div>
      ) : qrData ? (
        <div className={styles.card}>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <img src={qrData.qr_code} alt="QR Code" style={{ width: '200px', height: '200px' }} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', wordBreak: 'break-all' }}>
            Clé secrète : {qrData.secret}
          </div>
          <div className={styles.cardLabel}>Code de vérification</div>
          <input
            type="text"
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)', marginTop: '8px', marginBottom: '12px' }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
          />
          <button className={styles.editButton} onClick={handleVerify} disabled={loading || code.length !== 6}>
            Vérifier et activer
          </button>
          {qrData.backup_codes && (
            <div style={{ marginTop: '16px' }}>
              <div className={styles.cardLabel}>Codes de secours (à sauvegarder)</div>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', marginTop: '8px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                {qrData.backup_codes.map((c: string) => <span key={c}>{c}</span>)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.card}>
          <div style={{ marginBottom: '12px', color: 'var(--text-muted)' }}>Protégez votre compte avec l'authentification à deux facteurs.</div>
          <div className={styles.cardLabel}>Mot de passe</div>
          <input
            type="password"
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)', marginTop: '8px', marginBottom: '12px' }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className={styles.editButton} onClick={handleEnable} disabled={loading || !password}>
            Activer 2FA
          </button>
        </div>
      )}
    </div>
  );
}

function SessionsSection() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadSessions = async () => {
    try {
      const data = await api<any>('/api/users/@me/sessions');
      setSessions((data.sessions || []) as any[]);
    } catch { /* handled */ }
    setLoaded(true);
  };

  const revokeSession = async (id: string) => {
    try {
      await api(`/api/users/@me/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch { /* handled */ }
  };

  if (!loaded) {
    loadSessions();
    return <div className={styles.pageTitle}>Appareils</div>;
  }

  return (
    <div>
      <div className={styles.pageTitle}>Appareils connectés</div>
      {sessions.map((session) => (
        <div key={session.id} className={styles.card}>
          <div className={styles.cardRow}>
            <div>
              <div style={{ fontSize: '14px', marginBottom: '4px' }}>{session.device_info || 'Appareil inconnu'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                IP: {session.ip_address || '?'} — Dernière activité : {new Date(session.last_used_at).toLocaleString()}
              </div>
            </div>
            <button className={styles.editButton} style={{ background: 'var(--danger)', color: 'white' }} onClick={() => revokeSession(session.id)}>
              Révoquer
            </button>
          </div>
        </div>
      ))}
      {sessions.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucune session active.</div>}
    </div>
  );
}

function NotificationsSection() {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    muted: false,
    suppress_everyone: false,
    suppress_roles: false,
    message_notifications: 0,
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    api<{ settings: any[] }>('/api/notifications/settings')
      .then((data) => {
        if (!mounted) return;
        const globalSettings = (data.settings || []).find((setting) => !setting.guild_id && !setting.channel_id);
        if (globalSettings) {
          setSettingsId(globalSettings.id);
          setSettings({
            muted: globalSettings.muted ?? false,
            suppress_everyone: globalSettings.suppress_everyone ?? false,
            suppress_roles: globalSettings.suppress_roles ?? false,
            message_notifications: globalSettings.message_notifications ?? 0,
          });
        }
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const persist = async (next: typeof settings) => {
    setSaving(true);
    try {
      if (settingsId) {
        const updated = await api<any>(`/api/notifications/settings/${settingsId}`, {
          method: 'PATCH',
          body: JSON.stringify(next),
        });
        setSettingsId(updated.id);
      } else {
        const created = await api<any>('/api/notifications/settings', {
          method: 'POST',
          body: JSON.stringify(next),
        });
        setSettingsId(created.id);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (key: keyof typeof settings) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    await persist(next);
  };

  const handleSelect = async (value: number) => {
    const next = { ...settings, message_notifications: value };
    setSettings(next);
    await persist(next);
  };

  const inputStyle = { width: '18px', height: '18px' };

  return (
    <div>
      <div className={styles.pageTitle}>Notifications</div>

      {!loaded ? (
        <div className={styles.card}>Chargement…</div>
      ) : (
        <div className={styles.card}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Tout mettre en sourdine</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Masque l’ensemble des notifications.</div>
            </div>
            <input type="checkbox" checked={settings.muted} onChange={() => void handleToggle('muted')} style={inputStyle} disabled={saving} />
          </label>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Notifications de messages</div>
            <select
              value={settings.message_notifications}
              onChange={(e) => void handleSelect(Number(e.target.value))}
              disabled={saving}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
            >
              <option value={0}>Tous les messages</option>
              <option value={1}>Mentions uniquement</option>
              <option value={2}>Aucune</option>
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Ignorer @everyone et @here</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Ne pas être notifié pour les mentions globales.</div>
            </div>
            <input type="checkbox" checked={settings.suppress_everyone} onChange={() => void handleToggle('suppress_everyone')} style={inputStyle} disabled={saving} />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Ignorer les mentions de rôles</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Ne pas être notifié quand un rôle vous mentionne.</div>
            </div>
            <input type="checkbox" checked={settings.suppress_roles} onChange={() => void handleToggle('suppress_roles')} style={inputStyle} disabled={saving} />
          </label>
        </div>
      )}
    </div>
  );
}

function KeybindsSection() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const defaultKeybinds = [
    { id: 'toggle-mute', label: 'Couper le micro', key: 'Micro', category: 'Audio' },
    { id: 'toggle-deafen', label: 'Couper le son', key: 'M', category: 'Audio' },
    { id: 'disconnect-call', label: 'Quitter le appel', key: 'F2', category: 'Audio' },
    { id: 'toggle-sidebar', label: 'Afficher/Masquer la barre latérale', key: 'Ctrl + B', category: 'Interface' },
    { id: 'quick-switcher', label: 'Sélecteur rapide', key: 'Ctrl + K', category: 'Interface' },
    { id: 'toggle-user-settings', label: 'Ouvrir les paramètres', key: 'Ctrl + ,', category: 'Interface' },
    { id: 'mark-read', label: 'Marquer comme lu', key: 'Shift + Escape', category: 'Messages' },
    { id: 'upload-file', label: 'Joindre un fichier', key: 'Ctrl + Shift + U', category: 'Messages' },
    { id: 'emoji-picker', label: 'Sélecteur d\'emoji', key: 'Ctrl + E', category: 'Messages' },
    { id: 'gif-picker', label: 'Sélecteur de GIF', key: 'Ctrl + G', category: 'Messages' },
    { id: 'previous-channel', label: 'Channel précédent', key: 'Alt + ↑', category: 'Navigation' },
    { id: 'next-channel', label: 'Channel suivant', key: 'Alt + ↓', category: 'Navigation' },
    { id: 'previous-server', label: 'Serveur précédent', key: 'Ctrl + Alt + ↑', category: 'Navigation' },
    { id: 'next-server', label: 'Serveur suivant', key: 'Ctrl + Alt + ↓', category: 'Navigation' },
  ];

  const categories = [...new Set(defaultKeybinds.map((k) => k.category))];
  const filtered = search
    ? defaultKeybinds.filter((k) => k.label.toLowerCase().includes(search.toLowerCase()) || k.key.toLowerCase().includes(search.toLowerCase()))
    : defaultKeybinds;

  return (
    <div>
      <div className={styles.pageTitle}>Raccourcis clavier</div>

      <div className={styles.card} style={{ marginBottom: '16px' }}>
        <input
          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)' }}
          placeholder="Rechercher un raccourci…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {categories.map((cat) => {
        const items = filtered.filter((k) => k.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', padding: '0 4px' }}>{cat}</div>
            <div className={styles.card}>
              {items.map((kb) => (
                <div key={kb.id} className={styles.cardRow}>
                  <div className={styles.cardValue}>{kb.label}</div>
                  <kbd style={{ padding: '4px 8px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{kb.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Aucun raccourci trouvé.</div>}
    </div>
  );
}

function StreamerModeSection({ user, updateUser }: { user: any; updateUser: (data: any) => Promise<void> }) {
  const [streamerMode, setStreamerMode] = useState(user.streamer_mode_enabled || false);
  const [autoDetect, setAutoDetect] = useState(user.streamer_mode_auto_detect || true);
  const [hideLinks, setHideLinks] = useState(user.streamer_mode_hide_links || true);
  const [hideEmail, setHideEmail] = useState(user.streamer_mode_hide_email || true);
  const [hideNotes, setHideNotes] = useState(user.streamer_mode_hide_notes || true);
  const [hideNotifications, setHideNotifications] = useState(user.streamer_mode_hide_notifications || true);
  const [hidePersonalInfo, setHidePersonalInfo] = useState(user.streamer_mode_hide_personal_info || true);
  const [disableSounds, setDisableSounds] = useState(user.streamer_mode_disable_sounds || false);

  const handleToggle = async (field: string, value: boolean) => {
    if (field === 'streamer_mode_enabled') setStreamerMode(value);
    if (field === 'streamer_mode_auto_detect') setAutoDetect(value);
    if (field === 'streamer_mode_hide_links') setHideLinks(value);
    if (field === 'streamer_mode_hide_email') setHideEmail(value);
    if (field === 'streamer_mode_hide_notes') setHideNotes(value);
    if (field === 'streamer_mode_hide_notifications') setHideNotifications(value);
    if (field === 'streamer_mode_hide_personal_info') setHidePersonalInfo(value);
    if (field === 'streamer_mode_disable_sounds') setDisableSounds(value);
    await updateUser({ [field]: value });
  };

  const inputStyle = { width: '18px', height: '18px' };

  return (
    <div>
      <div className={styles.pageTitle}>Mode streamer</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', marginTop: '-8px' }}>
        Le mode streamer masque les éléments sensibles pour protéger votre vie privée pendant vos diffusions.
      </div>

      <div className={styles.card}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Activer le mode streamer</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Appliquer automatiquement lors d'un live</div>
          </div>
          <input type="checkbox" checked={streamerMode} onChange={() => handleToggle('streamer_mode_enabled', !streamerMode)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Détection automatique</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Activer automatiquement quand un live est détecté</div>
          </div>
          <input type="checkbox" checked={autoDetect} onChange={() => handleToggle('streamer_mode_auto_detect', !autoDetect)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Masquer les liens d&apos;invitation</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Ne pas afficher les liens d&apos;invitation</div>
          </div>
          <input type="checkbox" checked={hideLinks} onChange={() => handleToggle('streamer_mode_hide_links', !hideLinks)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Masquer l&apos;adresse email</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Ne pas afficher votre email</div>
          </div>
          <input type="checkbox" checked={hideEmail} onChange={() => handleToggle('streamer_mode_hide_email', !hideEmail)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Masquer les notes personnelles</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Ne pas afficher vos notes sur les autres</div>
          </div>
          <input type="checkbox" checked={hideNotes} onChange={() => handleToggle('streamer_mode_hide_notes', !hideNotes)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Désactiver les notifications de bureau</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Ne pas afficher les notifications système</div>
          </div>
          <input type="checkbox" checked={hideNotifications} onChange={() => handleToggle('streamer_mode_hide_notifications', !hideNotifications)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Masquer les informations personnelles</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Ne pas afficher bio, pronouns et autres</div>
          </div>
          <input type="checkbox" checked={hidePersonalInfo} onChange={() => handleToggle('streamer_mode_hide_personal_info', !hidePersonalInfo)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Couper les sons de notification</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Désactiver les sons des notifications</div>
          </div>
          <input type="checkbox" checked={disableSounds} onChange={() => handleToggle('streamer_mode_disable_sounds', !disableSounds)} style={inputStyle} />
        </label>
      </div>
    </div>
  );
}

function DataSection() {
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'done'>('idle');

  const handleExport = async () => {
    setExporting(true);
    setExportMsg('');
    try {
      await api('/api/users/@me/data-export');
      setExportMsg('Votre archive a été générée. Vérifiez vos emails.');
    } catch (err: any) {
      setExportMsg(err.message || 'Erreur lors de l\'export.');
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    if (deleteStep === 'confirm') {
      try {
        await api('/api/users/@me', {
          method: 'DELETE',
          body: JSON.stringify({ password: deletePassword }),
        });
        setDeleteStep('done');
        window.location.reload();
      } catch (err: any) {
        alert(err.message || 'Erreur lors de la suppression du compte.');
      }
    } else {
      setDeleteStep('confirm');
    }
  };

  return (
    <div>
      <div className={styles.pageTitle}>Données</div>

      <div className={styles.card}>
        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Exporter vos données</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Téléchargez une archive contenant tous vos messages, fichiers et paramètres.
        </div>
        <button className={styles.editButton} onClick={handleExport} disabled={exporting}>
          {exporting ? 'Génération…' : 'Demander mon archive'}
        </button>
        {exportMsg && <div style={{ fontSize: '13px', marginTop: '8px', color: exportMsg.includes('Erreur') ? 'var(--text-danger)' : 'var(--text-positive)' }}>{exportMsg}</div>}
      </div>

      <div className={styles.card} style={{ marginTop: '16px' }}>
        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: 'var(--text-danger)' }}>Zone dangereuse</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          La suppression est irréversible. Tous vos messages, serveurs et votre compte seront définitivement supprimés.
        </div>
        {deleteStep === 'confirm' ? (
          <>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>Confirmez votre mot de passe pour supprimer votre compte.</div>
            <input
              type="password"
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)', marginBottom: '12px' }}
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Votre mot de passe"
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={styles.editButton} style={{ background: 'var(--danger)', color: 'white' }} onClick={handleDelete}>
                Supprimer définitivement
              </button>
              <button className={styles.editButton} onClick={() => { setDeleteStep('idle'); setDeletePassword(''); }}>
                Annuler
              </button>
            </div>
          </>
        ) : (
          <button
            className={styles.editButton}
            style={{ background: 'var(--danger)', color: 'white' }}
            onClick={handleDelete}
          >
            Supprimer mon compte
          </button>
        )}
      </div>
    </div>
  );
}

function ConnectionsSection() {
  const [connections, setConnections] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadConnections = async () => {
    try {
      const data = await api<any>('/api/users/@me/connections');
      setConnections((data.connections || []) as any[]);
    } catch { /* handled */ }
    setLoaded(true);
  };

  useEffect(() => {
    if (!loaded) loadConnections();
  });

  if (!loaded) return <div><div className={styles.pageTitle}>Connexions</div></div>;

  const availableIntegrations = [
    { platform: 'github', label: 'GitHub', icon: '🐙', color: '#f0f6fc' },
    { platform: 'spotify', label: 'Spotify', icon: '🎧', color: '#1db954' },
    { platform: 'youtube', label: 'YouTube', icon: '▶️', color: '#ff0000' },
    { platform: 'twitter', label: 'Twitter / X', icon: '🐦', color: '#1da1f2' },
    { platform: 'twitch', label: 'Twitch', icon: '🟣', color: '#9146ff' },
    { platform: 'discord', label: 'Discord', icon: '', color: '#5865f2' },
  ];

  return (
    <div>
      <div className={styles.pageTitle}>Connexions</div>

      <div className={styles.card}>
        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Comptes liés</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Connectez vos autres comptes pour les afficher sur votre profil.</div>
        {availableIntegrations.map((intg) => {
          const connected = connections.find((c) => c.platform === intg.platform);
          return (
            <div key={intg.platform} className={styles.cardRow} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: intg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                  {intg.platform === 'github' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  ) : intg.platform === 'spotify' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                  ) : intg.platform === 'youtube' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  ) : intg.platform === 'twitch' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
                  ) : intg.platform === 'twitter' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  ) : intg.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{intg.label}</div>
                  {connected ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-positive)' }}>Connecté</div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Non connecté</div>
                  )}
                </div>
              </div>
              {connected ? (
                <button
                  className={styles.editButton}
                  style={{ background: 'transparent', fontSize: '12px', padding: '4px 10px' }}
                  onClick={async () => {
                    await api(`/api/users/@me/connections/${intg.platform}`, { method: 'DELETE' });
                    setConnections((prev) => prev.filter((c) => c.platform !== intg.platform));
                  }}
                >
                  Déconnecter
                </button>
              ) : (
                <button
                  className={styles.editButton}
                  style={{ background: 'var(--bg-accent)', color: 'white', fontSize: '12px', padding: '4px 10px' }}
                  onClick={() => {
                    window.open(`/api/oauth2/connect/${intg.platform}`, '_blank', 'width=500,height=600');
                  }}
                >
                  Connecter
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ApplicationsSection() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingBotId, setCreatingBotId] = useState('');
  const [message, setMessage] = useState('');
  const [revealedTokens, setRevealedTokens] = useState<Record<string, string>>({});

  const loadApplications = async () => {
    setLoading(true);
    try {
      const data = await api.applications.list<{ applications: any[] }>();
      setApplications(data.applications || []);
    } catch (err: any) {
      setMessage(err.message || 'Impossible de charger vos applications.');
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadApplications();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setMessage('');
    try {
      const data = await api.applications.create<{ application: any }>({
        name: name.trim(),
        description: description.trim() || undefined,
      } as any);
      setApplications((prev) => [data.application, ...prev]);
      setName('');
      setDescription('');
    } catch (err: any) {
      setMessage(err.message || 'Impossible de créer cette application.');
    }
    setCreating(false);
  };

  const handleCreateBot = async (applicationId: string) => {
    setCreatingBotId(applicationId);
    setMessage('');
    try {
      const data = await api.applications.createBot<{ bot: any; token: string }>(applicationId);
      setApplications((prev) => prev.map((app) => app.id === applicationId ? { ...app, bot_id: data.bot.id, bot: data.bot } : app));
      setRevealedTokens((prev) => ({ ...prev, [applicationId]: data.token }));
    } catch (err: any) {
      setMessage(err.message || 'Impossible de créer le bot.');
    }
    setCreatingBotId('');
  };

  return (
    <div>
      <div className={styles.pageTitle}>Applications</div>

      <div className={styles.card}>
        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Créer une application</div>
        <input
          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)' }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de l'application"
        />
        <textarea
          style={{ width: '100%', minHeight: 88, padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', marginTop: '12px', resize: 'vertical' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button className={styles.editButton} onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: '16px' }}>
        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Chargement…</div>
        ) : applications.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Aucune application créée.</div>
        ) : applications.map((application) => {
          const installUrl = `${window.location.origin}/oauth2/authorize?client_id=${application.id}&permissions=8`;
          return (
            <div key={application.id} style={{ paddingBottom: '16px', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
              <div className={styles.cardRow}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>{application.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {application.description || 'Aucune description.'}
                  </div>
                </div>
                {!application.bot ? (
                  <button className={styles.editButton} onClick={() => void handleCreateBot(application.id)} disabled={creatingBotId === application.id}>
                    {creatingBotId === application.id ? 'Création…' : 'Créer le bot'}
                  </button>
                ) : (
                  <button className={styles.editButton} onClick={() => navigator.clipboard.writeText(installUrl)}>
                    Copier le lien d’installation
                  </button>
                )}
              </div>

              {application.bot && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span>Bot: {application.bot.username}</span>
                  <span>Installation: {installUrl}</span>
                </div>
              )}

              {revealedTokens[application.id] && (
                <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', background: 'var(--bg-tertiary)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Token affiché une seule fois</div>
                  <code style={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '12px' }}>{revealedTokens[application.id]}</code>
                </div>
              )}
            </div>
          );
        })}
        {message && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{message}</div>}
      </div>
    </div>
  );
}

function PluginsSection() {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [savingSlug, setSavingSlug] = useState('');
  const [message, setMessage] = useState('');

  const loadPlugins = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [catalog, preferences] = await Promise.all([
        api.plugins.list<any[]>(),
        api.plugins.getUserSettings<any[]>(),
      ]);

      const preferenceMap = new Map((preferences || []).map((entry: any) => [entry.plugin.slug, entry]));
      const merged = (catalog || [])
        .filter((plugin: any) => plugin.type === 'CLIENT' || plugin.type === 'BOTH')
        .map((plugin: any) => {
          const saved = preferenceMap.get(plugin.slug);
          return {
            plugin,
            enabled: saved?.enabled ?? plugin.enabled_by_default ?? false,
            settings: saved?.settings ?? buildDefaultPluginSettings(plugin.settings_schema),
            dirty: false,
          };
        });

      setPlugins(merged);
      applyClientPluginPreferences(merged.map(({ plugin, enabled, settings }) => ({ plugin, enabled, settings })));
    } catch (err: any) {
      setMessage(err.message || 'Impossible de charger les plugins.');
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadPlugins();
  }, []);

  const updateLocalPlugin = (slug: string, updater: (current: any) => any) => {
    setPlugins((prev) => prev.map((entry) => entry.plugin.slug === slug ? updater(entry) : entry));
  };

  const savePlugin = async (slug: string, nextState?: any) => {
    const current = nextState || plugins.find((entry) => entry.plugin.slug === slug);
    if (!current) return;

    setSavingSlug(slug);
    setMessage('');
    try {
      const response = await api.plugins.saveUserSettings<any>({
        enabled: current.enabled,
        settings: current.settings,
      });

      setPlugins((prev) => {
        const updated = prev.map((entry) => entry.plugin.slug === slug ? {
          ...entry,
          enabled: response.enabled,
          settings: response.settings ?? entry.settings,
          dirty: false,
        } : entry);
        applyClientPluginPreferences(updated.map(({ plugin, enabled, settings }) => ({ plugin, enabled, settings })));
        return updated;
      });
    } catch (err: any) {
      setMessage(err.message || 'Impossible de sauvegarder ce plugin.');
    }
    setSavingSlug('');
  };

  const handleToggle = async (slug: string, enabled: boolean) => {
    const current = plugins.find((entry) => entry.plugin.slug === slug);
    if (!current) return;
    const nextState = { ...current, enabled };
    updateLocalPlugin(slug, () => ({ ...nextState }));
    await savePlugin(slug, nextState);
  };

  const filteredPlugins = plugins.filter((entry) => {
    const text = `${entry.plugin.name} ${entry.plugin.slug} ${entry.plugin.description || ''}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());
    return matchesQuery && (!showEnabledOnly || entry.enabled);
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    marginTop: '8px',
  };

  return (
    <div>
      <div className={styles.pageTitle}>Plugins</div>

      <div className={styles.card}>
        <div className={styles.cardRow} style={{ alignItems: 'center', gap: '12px' }}>
          <input
            style={{ ...inputStyle, marginTop: 0, flex: 1 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un plugin…"
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={showEnabledOnly} onChange={(e) => setShowEnabledOnly(e.target.checked)} />
            Actifs uniquement
          </label>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
          La recherche et le filtrage se font localement sur le catalogue chargé.
        </div>
        {message && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>{message}</div>}
      </div>

      <div className={styles.card} style={{ marginTop: '16px' }}>
        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Chargement…</div>
        ) : filteredPlugins.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Aucun plugin trouvé.</div>
        ) : filteredPlugins.map((entry, index) => {
          const schema = parsePluginSchema(entry.plugin.settings_schema);
          const properties = schema && typeof schema.properties === 'object' && schema.properties !== null ? Object.entries(schema.properties as Record<string, any>) : [];
          const isSaving = savingSlug === entry.plugin.slug;

          return (
            <div key={entry.plugin.slug} style={{ paddingBottom: index < filteredPlugins.length - 1 ? '16px' : 0, marginBottom: index < filteredPlugins.length - 1 ? '16px' : 0, borderBottom: index < filteredPlugins.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div className={styles.cardRow}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{entry.plugin.icon || '🧩'}</span>
                    <span>{entry.plugin.name}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {entry.plugin.description || 'Aucune description.'} · {entry.plugin.type}
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <input type="checkbox" checked={entry.enabled} onChange={(e) => void handleToggle(entry.plugin.slug, e.target.checked)} disabled={isSaving} />
                  {entry.enabled ? 'Activé' : 'Désactivé'}
                </label>
              </div>

              {properties.length > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {properties.map(([key, definition]) => {
                    const field = definition as Record<string, any>;
                    const value = entry.settings?.[key];
                    return (
                      <div key={key}>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{field.title || key}</div>
                        {field.type === 'boolean' ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                            <input
                              type="checkbox"
                              checked={Boolean(value)}
                              onChange={(e) => updateLocalPlugin(entry.plugin.slug, (current) => ({
                                ...current,
                                settings: { ...(current.settings || {}), [key]: e.target.checked },
                                dirty: true,
                              }))}
                            />
                            Activer
                          </label>
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            min={field.minimum}
                            max={field.maximum}
                            step="0.1"
                            style={inputStyle}
                            value={typeof value === 'number' ? value : field.default ?? ''}
                            onChange={(e) => updateLocalPlugin(entry.plugin.slug, (current) => ({
                              ...current,
                              settings: { ...(current.settings || {}), [key]: Number(e.target.value) },
                              dirty: true,
                            }))}
                          />
                        ) : (
                          <input
                            style={inputStyle}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => updateLocalPlugin(entry.plugin.slug, (current) => ({
                              ...current,
                              settings: { ...(current.settings || {}), [key]: e.target.value },
                              dirty: true,
                            }))}
                            placeholder={field.description || key}
                          />
                        )}
                      </div>
                    );
                  })}

                  <div>
                    <button className={styles.editButton} onClick={() => void savePlugin(entry.plugin.slug)} disabled={isSaving || !entry.dirty}>
                      {isSaving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivitiesSection({ user }: { user: any }) {
  const [activities, setActivities] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [showGameForm, setShowGameForm] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [newGameIcon, setNewGameIcon] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api<any>('/api/users/@me/activities').catch(() => ({ activities: [] })),
      api<any>('/api/users/@me/games').catch(() => []),
    ]).then(([acts, gms]) => {
      setActivities(acts.activities || []);
      setGames(gms.games || gms || []);
      setLoaded(true);
    });
  }, []);

  const addGame = async () => {
    if (!newGameName.trim()) return;
    try {
      const game = await api('/api/users/@me/games', {
        method: 'POST',
        body: JSON.stringify({ name: newGameName.trim(), icon_url: newGameIcon.trim() || undefined }),
      });
      setGames((prev) => [...prev, game]);
      setNewGameName('');
      setNewGameIcon('');
      setShowGameForm(false);
    } catch { /* handled */ }
  };

  const removeGame = async (gameId: string) => {
    try {
      await api(`/api/users/@me/games/${gameId}`, { method: 'DELETE' });
      setGames((prev) => prev.filter((g) => g.id !== gameId));
    } catch { /* handled */ }
  };

  return (
    <div>
      <div className={styles.pageTitle}>Activités</div>

      <div className={styles.card}>
        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Activité récente</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Applications et jeux que vous utilisez actuellement.</div>
        {!loaded ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Chargement…</div>
        ) : activities.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Aucune activité récente.</div>
        ) : (
          activities.map((act, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
              {act.emoji ? (
                <span style={{ fontSize: '24px' }}>{act.emoji}</span>
              ) : (
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🎮</div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{act.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{act.details || act.state || 'En cours'}</div>
              </div>
              {act.timestamps?.start && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {Math.floor((Date.now() - act.timestamps.start) / 60000)}m
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className={styles.card} style={{ marginTop: '16px' }}>
        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Bibliothèque de jeux</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>Ajoutez des jeux pour les afficher dans votre statut.</div>

        {games.length === 0 && !showGameForm && (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '12px' }}>Aucun jeu enregistré.</div>
        )}

        {games.map((game) => (
          <div key={game.id} className={styles.cardRow} style={{ marginBottom: '8px' }}>
            {game.icon_url ? (
              <img src={game.icon_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
            ) : (
              <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎮</div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{game.name}</div>
              {game.total_play_time_minutes > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {Math.floor(game.total_play_time_minutes / 60)}h {game.total_play_time_minutes % 60}m jouées
                </div>
              )}
            </div>
            <button
              className={styles.editButton}
              style={{ background: 'transparent', fontSize: '12px', padding: '4px 8px', color: 'var(--text-danger)' }}
              onClick={() => removeGame(game.id)}
            >
              Supprimer
            </button>
          </div>
        ))}

        {showGameForm ? (
          <div style={{ marginTop: '8px' }}>
            <input
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)', marginBottom: '8px' }}
              placeholder="Nom du jeu"
              value={newGameName}
              onChange={(e) => setNewGameName(e.target.value)}
            />
            <input
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-primary)', marginBottom: '12px' }}
              placeholder="URL de l'icône (optionnel)"
              value={newGameIcon}
              onChange={(e) => setNewGameIcon(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={styles.editButton} onClick={addGame}>Ajouter</button>
              <button className={styles.editButton} onClick={() => { setShowGameForm(false); setNewGameName(''); setNewGameIcon(''); }}>Annuler</button>
            </div>
          </div>
        ) : (
          <button className={styles.editButton} onClick={() => setShowGameForm(true)}>+ Ajouter un jeu</button>
        )}
      </div>

      <div className={styles.card} style={{ marginTop: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Afficher le statut de jeu</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Visible par vos amis</div>
          </div>
          <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px' }} />
        </label>
      </div>
    </div>
  );
}

function MyBoostsSection() {
  const [myBoosts, setMyBoosts] = useState<any[]>([]);
  const [availableBoosts, setAvailableBoosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    api.premium.getMyBoosts<any[]>().then(boosts => {
      const allBoosts = boosts || [];
      setAvailableBoosts(allBoosts.filter((b: any) => !b.guild_id));
      setMyBoosts(allBoosts.filter((b: any) => b.guild_id));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  const handleUnboost = async (guildId: string) => {
    try {
      await api.delete(`/guilds/${guildId}/boosts`);
      setMyBoosts(prev => prev.filter(b => b.guild_id !== guildId));
    } catch { /* handled */ }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Chargement…</div>;
  }

  const hasPremium = user?.premium;
  const totalBoosts = availableBoosts.length + myBoosts.length;

  return (
    <div>
      <div className={styles.pageTitle}>Mes Boosts</div>

      {!hasPremium ? (
        <div className={styles.card}>
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>💎</div>
            <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>OpenCord+ requis</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Souscrivez à OpenCord+ pour obtenir des boosts de serveur et soutenir vos communautés préférées.
            </div>
            <button className={styles.editButton} onClick={() => window.location.href = '/premium'}>
              Voir les plans OpenCord+
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '28px' }}>🔥</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{totalBoosts} boost{totalBoosts > 1 ? 's' : ''} disponible{totalBoosts > 1 ? 's' : ''}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {myBoosts.length} en cours d&apos;utilisation · {availableBoosts.length} disponible{availableBoosts.length > 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {myBoosts.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Boosts actifs</div>
                {myBoosts.map(boost => (
                  <div key={boost.id} className={styles.cardRow} style={{ marginBottom: '8px', padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{boost.guild?.name || 'Serveur inconnu'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Depuis le {new Date(boost.started_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <button
                      className={styles.editButton}
                      style={{ background: 'transparent', color: 'var(--text-danger)', fontSize: '12px', padding: '4px 8px' }}
                      onClick={() => handleUnboost(boost.guild_id)}
                    >
                      Retirer le boost
                    </button>
                  </div>
                ))}
              </div>
            )}

            {availableBoosts.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Boosts disponibles</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Utilisez vos boosts disponibles pour soutenir les serveurs que vous aimez.
                </div>
                {availableBoosts.map(boost => (
                  <div key={boost.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '20px' }}>🔥</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>Boost disponible</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Non utilisé · Obtenu le {new Date(boost.started_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {totalBoosts === 0 && (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Aucun boost disponible. Vos boosts apparaissent ici une fois votre abonnement OpenCord+ actif.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
