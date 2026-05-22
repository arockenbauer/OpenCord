import { useState, useEffect, useRef } from 'react';
import { X, Upload, Trash2, Plus, Check, ChevronDown, ShieldAlert, GripVertical, Search, X as XIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { api } from '../../services/api';
import { Modal } from '../../components/Modal/Modal';
import { GuildBoostPage } from '../Guild/GuildBoostPage';
import { buildDefaultPluginSettings, parsePluginSchema } from '../../utils/plugins';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './ServerSettingsPage.module.css';

const PERMISSION_DEFS = [
  { bit: 0x8n, label: 'Administrateur', group: 'Général' },
  { bit: 0x20n, label: 'Gérer le serveur', group: 'Général' },
  { bit: 0x10n, label: 'Gérer les canaux', group: 'Général' },
  { bit: 0x10000000n, label: 'Gérer les rôles', group: 'Général' },
  { bit: 0x40000000n, label: 'Gérer les émojis', group: 'Général' },
  { bit: 0x1n, label: 'Créer une invitation', group: 'Général' },
  { bit: 0x80n, label: 'Voir le journal d\'audit', group: 'Général' },
  { bit: 0x2n, label: 'Expulser des membres', group: 'Modération' },
  { bit: 0x4n, label: 'Bannir des membres', group: 'Modération' },
  { bit: 0x10000000000n, label: 'Mettre en sourdine', group: 'Modération' },
  { bit: 0x2000n, label: 'Gérer les messages', group: 'Modération' },
  { bit: 0x400n, label: 'Voir les canaux', group: 'Messagerie' },
  { bit: 0x800n, label: 'Envoyer des messages', group: 'Messagerie' },
  { bit: 0x40n, label: 'Ajouter des réactions', group: 'Messagerie' },
  { bit: 0x4000n, label: 'Intégrer des liens', group: 'Messagerie' },
  { bit: 0x8000n, label: 'Joindre des fichiers', group: 'Messagerie' },
  { bit: 0x10000n, label: 'Voir l\'historique', group: 'Messagerie' },
  { bit: 0x20000n, label: 'Mentionner @everyone', group: 'Messagerie' },
  { bit: 0x40000n, label: 'Utiliser des émojis externes', group: 'Messagerie' },
  { bit: 0x100000n, label: 'Se connecter', group: 'Vocal' },
  { bit: 0x200000n, label: 'Parler', group: 'Vocal' },
  { bit: 0x400000n, label: 'Rendre muet', group: 'Vocal' },
  { bit: 0x800000n, label: 'Rendre sourd', group: 'Vocal' },
  { bit: 0x1000000n, label: 'Déplacer des membres', group: 'Vocal' },
  { bit: 0x100n, label: 'Priorité orateur', group: 'Vocal' },
  { bit: 0x200n, label: 'Streamer (Go Live)', group: 'Vocal' },
  { bit: 0x2000000n, label: 'Voice Activity Detection', group: 'Vocal' },
  { bit: 0x40000000n, label: 'Gérer les webhooks', group: 'Avancé' },
  { bit: 0x80000000n, label: 'Utiliser les commandes d\'application', group: 'Avancé' },
  { bit: 0x400000000n, label: 'Gérer les fils', group: 'Avancé' },
  { bit: 0x800000000n, label: 'Créer des fils publics', group: 'Avancé' },
  { bit: 0x1000000000n, label: 'Créer des fils privés', group: 'Avancé' },
  { bit: 0x2000000000n, label: 'Utiliser des autocollants externes', group: 'Avancé' },
  { bit: 0x4000000000n, label: 'Envoyer dans les fils', group: 'Avancé' },
  { bit: 0x8000000000n, label: 'Gérer les événements', group: 'Avancé' },
  { bit: 0x8000000000n, label: 'Activités intégrées', group: 'Avancé' },
  { bit: 0x20000000000n, label: 'Voir analytiques créateur', group: 'Avancé' },
  { bit: 0x40000000000n, label: 'Utiliser le soundboard', group: 'Avancé' },
  { bit: 0x80000000000n, label: 'Créer expressions serveur', group: 'Avancé' },
  { bit: 0x100000000000n, label: 'Créer événements', group: 'Avancé' },
  { bit: 0x200000000000n, label: 'Utiliser sons externes', group: 'Avancé' },
  { bit: 0x400000000000n, label: 'Messages vocaux', group: 'Avancé' },
  { bit: 0x1000000000000n, label: 'Statut salon vocal', group: 'Avancé' },
  { bit: 0x2000000000000n, label: 'Envoyer des sondages', group: 'Avancé' },
  { bit: 0x4000000000000n, label: 'Utiliser apps externes', group: 'Avancé' },
  { bit: 0x8000000000000n, label: 'Épingler messages', group: 'Avancé' },
  { bit: 0x10000000000000n, label: 'Contourner slowmode', group: 'Avancé' },
  { bit: 0x4000000n, label: 'Changer son pseudo', group: 'Profil' },
  { bit: 0x8000000n, label: 'Gérer les pseudonymes', group: 'Profil' },
  { bit: 0x1000n, label: 'Envoyer des messages TTS', group: 'Messagerie' },
];

const DISCORD_COLORS = [
  '#1ABC9C', '#2ECC71', '#3498DB', '#9B59B6', '#E91E63',
  '#F1C40F', '#E67E22', '#E74C3C', '#95A5A6', '#607D8B',
  '#11806A', '#1F8B4C', '#206694', '#71368A', '#AD1457',
  '#C27C0E', '#A84300', '#992D22', '#979C9F', '#546E7A',
];

const PERM_DESCRIPTIONS: Record<string, string> = {
  '8': 'Les membres avec cette permission ont toutes les permissions et contournent les overwrites de canaux.',
  '32': 'Permet de modifier les paramètres du serveur comme le nom et l\'icône.',
  '16': 'Permet de créer, modifier ou supprimer des canaux textuels et vocaux.',
  '268435456': 'Permet de créer, modifier ou supprimer des rôles inférieurs au rôle le plus élevé du membre.',
  '1073741824': 'Permet d\'ajouter, modifier et supprimer des émojis et stickers personnalisés.',
  '1': 'Permet de créer des invitations vers ce serveur.',
  '128': 'Permet de voir qui a fait quoi dans ce serveur.',
  '2': 'Permet d\'expulser des membres du serveur.',
  '4': 'Permet de bannir définitivement des membres du serveur.',
  '1099511627776': 'Permet de rendre temporairement muet des membres dans les canaux vocaux.',
  '8192': 'Permet de supprimer les messages des autres et d\'épingler des messages.',
  '1024': 'Permet de voir les canaux auxquels ce rôle a accès.',
  '2048': 'Permet d\'envoyer des messages dans les canaux textuels.',
  '64': 'Permet d\'ajouter des réactions aux messages.',
  '16384': 'Permet d\'intégrer des aperçus pour les liens partagés.',
  '32768': 'Permet d\'envoyer des fichiers et des médias.',
  '65536': 'Permet de voir les messages précédents d\'un canal.',
  '131072': 'Permet de mentionner @everyone et @here ainsi que tous les rôles.',
  '262144': 'Permet d\'utiliser des émojis provenant d\'autres serveurs.',
  '1048576': 'Permet de rejoindre des canaux vocaux et de stage.',
  '2097152': 'Permet de parler dans les canaux vocaux.',
  '4194304': 'Permet de rendre muet des membres dans les canaux vocaux.',
  '8388608': 'Permet de rendre sourd des membres dans les canaux vocaux.',
  '16777216': 'Permet de déplacer des membres entre différents canaux vocaux.',
  '536870912': 'Permet de créer, modifier et supprimer des webhooks.',
  '2147483648': 'Permet d\'utiliser les commandes slash et les applications des bots.',
  '17179869184': 'Permet de créer, archiver et supprimer des fils de discussion.',
  '34359738368': 'Permet de créer des fils de discussion publics.',
  '68719476736': 'Permet de créer des fils de discussion privés.',
  '137438953472': 'Permet d\'utiliser des autocollants provenant d\'autres serveurs.',
  '274877906944': 'Permet d\'envoyer des messages dans les fils de discussion.',
  '549755813888': 'Permet de créer et gérer des événements de serveur.',
  '67108864': 'Permet de modifier son propre pseudo sur ce serveur.',
  '134217728': 'Permet de modifier les pseudos des autres membres.',
  '4096': 'Permet d\'utiliser la synthèse vocale pour envoyer des messages.',
};

const AUTOMOD_TRIGGER_LABELS: Record<number, string> = {
  1: 'Mot-clé',
  2: 'Contenu nuisible',
  3: 'Spam',
  4: 'Mention spam',
  5: 'Filtre personnalisé',
};

const AUTOMOD_ACTION_LABELS: Record<number, string> = {
  1: 'Bloquer le message',
  2: 'Rendre muet le membre',
  3: 'Avertir le membre',
  4: 'Fermer le salon',
};

const TIMEOUT_DURATIONS = [
  { label: '1 heure', seconds: 3600 },
  { label: '1 jour', seconds: 86400 },
  { label: '7 jours', seconds: 604800 },
  { label: '30 jours', seconds: 2592000 },
];

const AUDIT_ACTION_LABELS: Record<string, string> = {
  MEMBER_KICK: 'Expulsion',
  MEMBER_BAN_ADD: 'Bannissement',
  MEMBER_BAN_REMOVE: 'Débannissement',
  MEMBER_TIMEOUT: 'Mise en sourdine',
  MEMBER_TIMEOUT_REMOVE: 'Sourdine levée',
  GUILD_UPDATE: 'Serveur modifié',
  CHANNEL_CREATE: 'Canal créé',
  CHANNEL_UPDATE: 'Canal modifié',
  CHANNEL_DELETE: 'Canal supprimé',
  ROLE_CREATE: 'Rôle créé',
  ROLE_UPDATE: 'Rôle modifié',
  ROLE_DELETE: 'Rôle supprimé',
  MESSAGE_DELETE: 'Message supprimé',
  INVITE_CREATE: 'Invitation créée',
  INVITE_DELETE: 'Invitation supprimée',
  EMOJI_CREATE: 'Émoji créé',
  EMOJI_DELETE: 'Émoji supprimé',
  EMOJI_UPDATE: 'Émoji modifié',
};

export function ServerSettingsPage() {
  const guild = useGuildStore((s) => s.getSelectedGuild());
  const updateGuildStore = useGuildStore((s) => s.updateGuild);
  const removeGuild = useGuildStore((s) => s.removeGuild);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const currentUser = useAuthStore((s) => s.user);
  const setShowServerSettings = useUIStore((s) => s.setShowServerSettings);
  const activeTab = useUIStore((s) => s.activeServerSettingsTab);
  const setActiveTab = useUIStore((s) => s.setActiveServerSettingsTab);

  if (!guild || !currentUser) return null;

  const isOwner = guild.owner_id === currentUser.id;
  const close = () => setShowServerSettings(false);

  const tabs = [
    { id: 'overview', label: 'Vue d\'ensemble' },
    { id: 'members', label: 'Membres' },
    { id: 'roles', label: 'Rôles' },
    { id: 'channels', label: 'Canaux' },
    { id: 'emojis', label: 'Émojis' },
    { id: 'invites', label: 'Invitations' },
    { id: 'integrations', label: 'Intégrations' },
    { id: 'plugins', label: 'Plugins' },
    { id: 'moderation', label: 'Modération' },
    { id: 'automod', label: 'AutoMod' },
    { id: 'boost', label: 'Avantages de boost' },
    { id: 'audit-log', label: 'Journal d\'audit' },
    { id: 'danger', label: isOwner ? 'Supprimer le serveur' : 'Quitter le serveur', danger: true },
  ] as const;

  return (
    <Modal onClose={close} contentClassName={styles.modal}>
      <div className={styles.shell}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarInner}>
            <div className={styles.sidebarTitle}>{guild.name}</div>
            {tabs.map((tab, i) => (
              <span key={tab.id}>
                {i === tabs.length - 1 && <div className={styles.divider} />}
                <button
                  className={`${styles.navItem} ${activeTab === tab.id ? styles.navItemActive : ''} ${'danger' in tab && tab.danger ? styles.navItemDanger : ''}`}
                  onClick={() => setActiveTab(tab.id as any)}
                >
                  {tab.label}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className={styles.content}>
          <div className={styles.contentInner}>
            {activeTab === 'overview' && <OverviewTab guild={guild} updateGuildStore={updateGuildStore} />}
            {activeTab === 'members' && <MembersTab guild={guild} currentUser={currentUser} />}
            {activeTab === 'roles' && <RolesTab guild={guild} />}
            {activeTab === 'channels' && <ChannelsTab guild={guild} />}
            {activeTab === 'emojis' && <EmojisTab guild={guild} />}
            {activeTab === 'invites' && <InvitesTab guild={guild} />}
            {activeTab === 'integrations' && <IntegrationsTab guild={guild} />}
            {activeTab === 'plugins' && <GuildPluginsTab guild={guild} />}
            {activeTab === 'moderation' && <ModerationTab guild={guild} />}
            {activeTab === 'automod' && <AutoModTab guild={guild} />}
            {activeTab === 'boost' && <GuildBoostPage />}
            {activeTab === 'audit-log' && <AuditLogTab guild={guild} />}
            {activeTab === 'danger' && <DangerTab guild={guild} isOwner={isOwner} removeGuild={removeGuild} selectGuild={selectGuild} close={close} />}
          </div>
          <div className={styles.closeArea} onClick={close}>
            <div className={styles.closeCircle}><X size={18} /></div>
            <span className={styles.closeLabel}>ESC</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function OverviewTab({ guild, updateGuildStore }: { guild: any; updateGuildStore: any }) {
  const [name, setName] = useState(guild.name);
  const [description, setDescription] = useState(guild.description || '');
  const [verificationLevel, setVerificationLevel] = useState(guild.verification_level ?? 0);
  const [defaultNotifications, setDefaultNotifications] = useState(guild.default_message_notifications ?? 0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const iconRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const updated = await api(`/api/guilds/${guild.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), description: description || null, verification_level: verificationLevel, default_message_notifications: defaultNotifications }),
      });
      updateGuildStore(guild.id, updated);
      setMsg('Modifications enregistrées.');
    } catch (err: any) {
      setMsg(err.message);
    }
    setSaving(false);
  };

  const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await api<any>(`/api/guilds/${guild.id}/icon`, { method: 'PATCH', body: form as any });
      updateGuildStore(guild.id, { icon: res.icon });
      setMsg('Icône mise à jour.');
    } catch (err: any) {
      setMsg(err.message);
    }
    e.target.value = '';
  };

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await api<any>(`/api/guilds/${guild.id}/banner`, { method: 'PATCH', body: form as any });
      updateGuildStore(guild.id, { banner: res.banner as string | undefined });
      setMsg('Bannière mise à jour.');
    } catch (err: any) {
      setMsg(err.message);
    }
    e.target.value = '';
  };

  return (
    <div>
      <div className={styles.pageTitle}>Vue d'ensemble</div>
      <div className={styles.card}>
        <div className={styles.mediaRow}>
          <div>
            <div className={styles.fieldLabel}>Icône du serveur</div>
            <div className={styles.avatarWrap} onClick={() => iconRef.current?.click()}>
              {guild.icon ? <img src={guild.icon} alt="" className={styles.avatarImg} /> : <span className={styles.avatarFallback}>{guild.name.slice(0, 1).toUpperCase()}</span>}
              <div className={styles.avatarOverlay}><Upload size={20} /></div>
            </div>
            <input ref={iconRef} type="file" accept="image/*" hidden onChange={handleIconChange} />
          </div>
          <div className={styles.bannerWrap}>
            <div className={styles.fieldLabel}>Bannière du serveur</div>
            <div className={styles.bannerPreview} style={guild.banner ? { backgroundImage: `url(${guild.banner})` } : undefined} onClick={() => bannerRef.current?.click()}>
              {!guild.banner && <span className={styles.bannerPlaceholder}><Upload size={20} /><span>Choisir une image</span></span>}
              {guild.banner && <div className={styles.bannerOverlay}><Upload size={20} /></div>}
            </div>
            <input ref={bannerRef} type="file" accept="image/*" hidden onChange={handleBannerChange} />
          </div>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.fieldLabel}>Nom du serveur</div>
        <input className={styles.textInput} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />

        <div className={styles.fieldLabel} style={{ marginTop: 16 }}>Description</div>
        <textarea className={styles.textArea} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1024} placeholder="Décrivez votre serveur…" />

        <div className={styles.twoCol} style={{ marginTop: 16 }}>
          <div>
            <div className={styles.fieldLabel}>Niveau de vérification</div>
            <div className={styles.selectWrap}>
              <select className={styles.select} value={verificationLevel} onChange={(e) => setVerificationLevel(Number(e.target.value))}>
                <option value={0}>Aucun</option>
                <option value={1}>Faible — email vérifié</option>
                <option value={2}>Moyen — membre depuis 5 min</option>
                <option value={3}>Élevé — membre depuis 10 min</option>
                <option value={4}>Très élevé — téléphone vérifié</option>
              </select>
              <ChevronDown size={14} className={styles.selectIcon} />
            </div>
          </div>
          <div>
            <div className={styles.fieldLabel}>Notifications par défaut</div>
            <div className={styles.selectWrap}>
              <select className={styles.select} value={defaultNotifications} onChange={(e) => setDefaultNotifications(Number(e.target.value))}>
                <option value={0}>Tous les messages</option>
                <option value={1}>Mentions uniquement</option>
              </select>
              <ChevronDown size={14} className={styles.selectIcon} />
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
        {msg && <div className={styles.feedback}>{msg}</div>}
      </div>

      <WidgetToggle guild={guild} />
    </div>
  );
}

function WidgetToggle({ guild }: { guild: any }) {
  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [channels, setChannels] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<any>(`/guilds/${guild.id}/widget`).then(res => {
      setEnabled(res.enabled ?? false);
      setChannelId(res.channel_id ?? '');
    }).catch(() => {});
    setChannels((guild.channels || []).filter((c: any) => c.type === 0));
  }, [guild.id, guild.channels]);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      await api.guilds.updateWidget(guild.id, { enabled, channel_id: channelId || null });
      setMsg('Widget mis à jour.');
    } catch (e: any) { setMsg(e.message); }
    setSaving(false);
  };

  return (
    <div className={styles.card} style={{ marginTop: 16 }}>
      <div className={styles.fieldLabel}>Widget du serveur</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Permet aux non-membres de rejoindre le serveur via un lien d&apos;invitation intégré.
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '12px' }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: '18px', height: '18px' }} />
        <span style={{ fontSize: '14px' }}>Activer le widget du serveur</span>
      </label>
      {enabled && (
        <div style={{ marginBottom: '12px' }}>
          <div className={styles.fieldLabel}>Canal d&apos;invitation</div>
          <div className={styles.selectWrap}>
            <select className={styles.select} value={channelId} onChange={e => setChannelId(e.target.value)}>
              <option value="">Sélectionner un canal</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className={styles.selectIcon} />
          </div>
        </div>
      )}
      <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      {msg && <div className={styles.feedback}>{msg}</div>}
    </div>
  );
}

function MembersTab({ guild, currentUser }: { guild: any; currentUser: any }) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [timeoutDuration, setTimeoutDuration] = useState('60');
  const [actionLoading, setActionLoading] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRoleId, setBulkRoleId] = useState<string>('');

  useEffect(() => {
    api(`/api/guilds/${guild.id}/members?limit=100`)
      .then((d: any) => setMembers(d.members || []))
      .catch((e: any) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [guild.id]);

  const filtered = members.filter((m) => {
    const name = (m.nickname || m.user.username).toLowerCase();
    return name.includes(query.toLowerCase());
  });

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  };

  const selectAllVisible = () => {
    const visible = filtered.map((m) => m.user.id).filter((id) => id !== currentUser.id && id !== guild.owner_id);
    const allSelected = visible.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !visible.includes(id)) : Array.from(new Set([...selectedIds, ...visible])));
  };

  const handleKick = async (userId: string) => {
    if (!confirm('Expulser ce membre ?')) return;
    setActionLoading(userId + ':kick');
    try {
      await api(`/api/guilds/${guild.id}/members/${userId}`, { method: 'DELETE' });
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
      setSelectedMember(null);
      setSelectedIds((prev) => prev.filter((id) => id !== userId));
      setMsg('Membre expulsé.');
    } catch (e: any) { setMsg(e.message); }
    setActionLoading('');
  };

  const handleBan = async (userId: string) => {
    if (!confirm('Bannir ce membre ?')) return;
    setActionLoading(userId + ':ban');
    try {
      await api(`/api/guilds/${guild.id}/bans/${userId}`, { method: 'PUT', body: JSON.stringify({}) });
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
      setSelectedMember(null);
      setSelectedIds((prev) => prev.filter((id) => id !== userId));
      setMsg('Membre banni.');
    } catch (e: any) { setMsg(e.message); }
    setActionLoading('');
  };

  const handleTimeout = async (userId: string) => {
    setActionLoading(userId + ':timeout');
    const until = new Date(Date.now() + Number(timeoutDuration) * 1000).toISOString();
    try {
      await api(`/api/guilds/${guild.id}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ communication_disabled_until: until }),
      });
      setMsg('Membre mis en sourdine.');
    } catch (e: any) { setMsg(e.message); }
    setActionLoading('');
  };

  const handleRoleToggle = async (member: any, roleId: string) => {
    const has = member.roles.includes(roleId);
    const newRoles = has ? member.roles.filter((r: string) => r !== roleId) : [...member.roles, roleId];
    try {
      await api(`/api/guilds/${guild.id}/members/${member.user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ roles: newRoles }),
      });
      setMembers((prev) => prev.map((m) => m.user.id === member.user.id ? { ...m, roles: newRoles } : m));
      if (selectedMember?.user.id === member.user.id) setSelectedMember((prev: any) => ({ ...prev, roles: newRoles }));
    } catch (e: any) { setMsg(e.message); }
  };

  const handleBulkKick = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Expulser ${selectedIds.length} membre(s) ?`)) return;
    setActionLoading('bulk:kick');
    for (const id of [...selectedIds]) {
      if (id === currentUser.id || id === guild.owner_id) continue;
      try {
        await api(`/api/guilds/${guild.id}/members/${id}`, { method: 'DELETE' });
        setMembers((prev) => prev.filter((m) => m.user.id !== id));
        setSelectedIds((prev) => prev.filter((sid) => sid !== id));
      } catch (e: any) {
        setMsg(`Erreur pour ${id}: ${e.message}`);
      }
    }
    setActionLoading('');
    setMsg('Expulsion en masse terminée.');
  };

  const handleBulkBan = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Bannir ${selectedIds.length} membre(s) ?`)) return;
    setActionLoading('bulk:ban');
    for (const id of [...selectedIds]) {
      if (id === currentUser.id || id === guild.owner_id) continue;
      try {
        await api(`/api/guilds/${guild.id}/bans/${id}`, { method: 'PUT', body: JSON.stringify({}) });
        setMembers((prev) => prev.filter((m) => m.user.id !== id));
        setSelectedIds((prev) => prev.filter((sid) => sid !== id));
      } catch (e: any) {
        setMsg(`Erreur pour ${id}: ${e.message}`);
      }
    }
    setActionLoading('');
    setMsg('Bannissement en masse terminé.');
  };

  const handleBulkRoleModify = async (mode: 'add' | 'remove') => {
    if (!bulkRoleId) { setMsg('Sélectionnez un rôle.'); return; }
    if (selectedIds.length === 0) return;
    if (!confirm(`${mode === 'add' ? 'Ajouter' : 'Retirer'} le rôle à ${selectedIds.length} membre(s) ?`)) return;
    setActionLoading('bulk:role');
    for (const id of [...selectedIds]) {
      if (id === currentUser.id) continue; // skip self
      const member = members.find((m) => m.user.id === id);
      if (!member) continue;
      const has = member.roles.includes(bulkRoleId);
      const newRoles = mode === 'add' ? (has ? member.roles : [...member.roles, bulkRoleId]) : member.roles.filter((r: string) => r !== bulkRoleId);
      try {
        await api(`/api/guilds/${guild.id}/members/${id}`, { method: 'PATCH', body: JSON.stringify({ roles: newRoles }) });
        setMembers((prev) => prev.map((m) => m.user.id === id ? { ...m, roles: newRoles } : m));
        setSelectedIds((prev) => prev.filter((sid) => sid !== id));
      } catch (e: any) {
        setMsg(`Erreur pour ${id}: ${e.message}`);
      }
    }
    setActionLoading('');
    setMsg('Mise à jour des rôles en masse terminée.');
  };

  const assignableRoles = guild.roles.filter((r: any) => r.name !== '@everyone');

  return (
    <div className={styles.splitLayout}>
      <div className={styles.splitLeft}>
        <div className={styles.pageTitle}>Membres ({members.length})</div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button className={styles.secondaryBtn} onClick={selectAllVisible}>Sélectionner la page</button>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selectedIds.length} sélectionné(s)</div>
          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button className={styles.secondaryBtn} onClick={handleBulkKick} disabled={!!actionLoading}>Expulser ({selectedIds.length})</button>
              <button className={styles.dangerBtn} onClick={handleBulkBan} disabled={!!actionLoading}>Bannir ({selectedIds.length})</button>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select className={styles.select} value={bulkRoleId} onChange={(e) => setBulkRoleId(e.target.value)}>
                  <option value="">Rôle…</option>
                  {assignableRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button className={styles.secondaryBtn} onClick={() => handleBulkRoleModify('add')} disabled={!!actionLoading || !bulkRoleId}>Ajouter</button>
                <button className={styles.secondaryBtn} onClick={() => handleBulkRoleModify('remove')} disabled={!!actionLoading || !bulkRoleId}>Retirer</button>
              </div>
            </div>
          )}
        </div>

        <input className={styles.textInput} placeholder="Rechercher un membre…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
        {loading ? <div className={styles.muted}>Chargement…</div> : (
          <div className={styles.memberList}>
            {filtered.map((m) => (
              <div key={m.user.id} style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(m.user.id)}
                  onChange={() => toggleSelect(m.user.id)}
                  disabled={m.user.id === currentUser.id || m.user.id === guild.owner_id}
                  style={{ marginRight: 8 }}
                />
                <button
                  className={`${styles.memberRow} ${selectedMember?.user.id === m.user.id ? styles.memberRowActive : ''}`}
                  onClick={() => setSelectedMember(m)}
                  style={{ flex: 1, textAlign: 'left' }}
                >
                  <div className={styles.memberAvatar}>
                    {m.user.avatar ? <img src={m.user.avatar} alt="" className={styles.avatarImg} /> : m.user.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberName}>{m.nickname || m.user.username}</div>
                    {m.nickname && <div className={styles.muted} style={{ fontSize: 12 }}>{m.user.username}#{m.user.discriminator}</div>}
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
        {msg && <div className={styles.feedback}>{msg}</div>}
      </div>

      {selectedMember && (
        <div className={styles.splitRight}>
          <div className={styles.memberDetailName}>{selectedMember.nickname || selectedMember.user.username}</div>
          <div className={styles.muted} style={{ marginBottom: 12 }}>
            {selectedMember.user.username}#{selectedMember.user.discriminator} · Rejoint le {selectedMember.joined_at ? format(new Date(selectedMember.joined_at), 'dd/MM/yyyy') : '—'}
          </div>

          <div className={styles.fieldLabel}>Rôles</div>
          <div className={styles.roleCheckList}>
            {assignableRoles.map((role: any) => (
              <label key={role.id} className={styles.roleCheckItem}>
                <input
                  type="checkbox"
                  checked={selectedMember.roles.includes(role.id)}
                  onChange={() => handleRoleToggle(selectedMember, role.id)}
                  disabled={selectedMember.user.id === currentUser.id}
                />
                <span className={styles.roleCheckDot} style={role.color ? { background: role.color } : undefined} />
                <span>{role.name}</span>
              </label>
            ))}
          </div>

          {selectedMember.user.id !== currentUser.id && selectedMember.user.id !== guild.owner_id && (
            <div style={{ marginTop: 16 }}>
              <div className={styles.fieldLabel}>Sourdine temporaire</div>
              <div className={styles.row}>
                <div className={styles.selectWrap} style={{ flex: 1 }}>
                  <select className={styles.select} value={timeoutDuration} onChange={(e) => setTimeoutDuration(e.target.value)}>
                    <option value="60">1 minute</option>
                    <option value="300">5 minutes</option>
                    <option value="600">10 minutes</option>
                    <option value="1800">30 minutes</option>
                    <option value="3600">1 heure</option>
                    <option value="86400">1 jour</option>
                    <option value="604800">1 semaine</option>
                  </select>
                  <ChevronDown size={14} className={styles.selectIcon} />
                </div>
                <button className={styles.secondaryBtn} onClick={() => handleTimeout(selectedMember.user.id)} disabled={actionLoading === selectedMember.user.id + ':timeout'}>
                  Appliquer
                </button>
              </div>

              <div className={styles.actions} style={{ marginTop: 8 }}>
                <button className={styles.secondaryBtn} onClick={() => handleKick(selectedMember.user.id)} disabled={actionLoading === selectedMember.user.id + ':kick'}>
                  Expulser
                </button>
                <button className={styles.dangerBtn} onClick={() => handleBan(selectedMember.user.id)} disabled={actionLoading === selectedMember.user.id + ':ban'}>
                  Bannir
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SortableRoleItem({ role, isSelected, onSelect, onMoveUp, onMoveDown, isFirst, isLast }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.roleItemRow} ${isSelected ? styles.roleItemRowActive : ''} ${isDragging ? styles.roleItemRowDragging : ''}`}
    >
      <div className={styles.roleDragHandle} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </div>
      <button className={styles.roleItemBtn} onClick={() => onSelect(role)}>
        <span className={styles.roleColorDot} style={role.color ? { background: role.color } : undefined} />
        {role.unicode_emoji && <span className={styles.roleEmoji}>{role.unicode_emoji}</span>}
        <span className={styles.roleItemName}>{role.name}</span>
      </button>
    </div>
  );
}

function RolesTab({ guild }: { guild: any }) {
  const updateGuildStore = useGuildStore((s) => s.updateGuild);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [activeRoleTab, setActiveRoleTab] = useState<'display' | 'permissions' | 'members'>('display');
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState<string | null>(null);
  const [roleHoist, setRoleHoist] = useState(false);
  const [roleMentionable, setRoleMentionable] = useState(false);
  const [rolePerms, setRolePerms] = useState(0n);
  const [roleUnicodeEmoji, setRoleUnicodeEmoji] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [roleIcon, setRoleIcon] = useState<string | null>(null);
  const [roleMembers, setRoleMembers] = useState<any[]>([]);
  const [roleMembersLoading, setRoleMembersLoading] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [roles, setRoles] = useState<any[]>(guild.roles || []);

  useEffect(() => {
    setRoles(guild.roles || []);
  }, [guild.roles]);

  useEffect(() => {
    if (!selectedRole || activeRoleTab !== 'members') return;
    let mounted = true;
    setRoleMembersLoading(true);
    setRoleMembers([]);
    api<any>(`/api/guilds/${guild.id}/members?limit=1000`)
      .then((data) => {
        if (!mounted) return;
        const list = (data.members || data || []).filter((m: any) =>
          Array.isArray(m.roles) && m.roles.includes(selectedRole.id)
        );
        setRoleMembers(list);
      })
      .catch(() => { if (mounted) setRoleMembers([]); })
      .finally(() => { if (mounted) setRoleMembersLoading(false); });
    return () => { mounted = false; };
  }, [selectedRole?.id, activeRoleTab, guild.id]);

  const selectRole = (role: any) => {
    setSelectedRole(role);
    setRoleName(role.name);
    setRoleColor(role.color || null);
    setRoleHoist(role.hoist || false);
    setRoleMentionable(role.mentionable || false);
    setRolePerms(BigInt(role.permissions || '0'));
    setRoleUnicodeEmoji(role.unicode_emoji || '');
    setRoleIcon(role.icon || null);
    setMsg('');
    setActiveRoleTab('display');
  };

  const handleCreate = async () => {
    try {
      const role = await api(`/api/guilds/${guild.id}/roles`, {
        method: 'POST',
        body: JSON.stringify({ name: 'Nouveau rôle' }),
      });
      updateGuildStore(guild.id, { roles: [...guild.roles, role] });
      setRoles((prev) => [...prev, role]);
      selectRole(role);
    } catch (e: any) { setMsg(e.message); }
  };

  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      const payload = selectedRole.name === '@everyone'
        ? {
            mentionable: roleMentionable,
            permissions: rolePerms.toString(),
          }
        : {
            name: roleName,
            color: roleColor || null,
            hoist: roleHoist,
            mentionable: roleMentionable,
            permissions: rolePerms.toString(),
            unicode_emoji: roleUnicodeEmoji || null,
          };
      const updated = await api<any>(`/api/guilds/${guild.id}/roles/${selectedRole.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      updateGuildStore(guild.id, { roles: guild.roles.map((r: any) => r.id === updated.id ? updated : r) });
      setRoles((prev) => prev.map((r: any) => r.id === updated.id ? updated : r));
      setSelectedRole(updated);
      setMsg('Modifications enregistrées.');
    } catch (e: any) { setMsg(e.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedRole || selectedRole.name === '@everyone') return;
    if (!confirm(`Supprimer le rôle "${selectedRole.name}" ?`)) return;
    try {
      await api(`/api/guilds/${guild.id}/roles/${selectedRole.id}`, { method: 'DELETE' });
      updateGuildStore(guild.id, { roles: guild.roles.filter((r: any) => r.id !== selectedRole.id) });
      setRoles((prev) => prev.filter((r: any) => r.id !== selectedRole.id));
      setSelectedRole(null);
    } catch (e: any) { setMsg(e.message); }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedRole) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const updated = await api<any>(`/api/guilds/${guild.id}/roles/${selectedRole.id}/icon`, { method: 'PATCH', body: form as any });
      updateGuildStore(guild.id, { roles: guild.roles.map((r: any) => r.id === updated.id ? updated : r) });
      setRoles((prev) => prev.map((r: any) => r.id === updated.id ? updated : r));
      setSelectedRole(updated);
      setRoleIcon(updated.icon ?? null);
    } catch (err: any) { setMsg(err.message); }
    e.target.value = '';
  };

  const moveRole = async (roleId: string, direction: -1 | 1) => {
    const sorted = [...roles].sort((a: any, b: any) => a.position - b.position);
    const idx = sorted.findIndex((r: any) => r.id === roleId);
    if (idx <= 0 && direction === -1) return;
    if (idx >= sorted.length - 1 && direction === 1) return;
    const newPos = sorted[idx].position + direction;
    const other = sorted.find((r: any) => r.position === newPos);
    if (!other) return;
    try {
      await api(`/api/guilds/${guild.id}/roles/positions`, {
        method: 'PATCH',
        body: JSON.stringify([{ id: roleId, position: other.position }, { id: other.id, position: sorted[idx].position }]),
      });
      const updatedRoles = roles.map((r: any) => {
        if (r.id === roleId) return { ...r, position: other.position };
        if (r.id === other.id) return { ...r, position: sorted[idx].position };
        return r;
      });
      updateGuildStore(guild.id, { roles: updatedRoles });
      setRoles(updatedRoles);
    } catch (e: any) { setMsg(e.message); }
  };

  const togglePerm = (bit: bigint) => {
    setRolePerms((prev) => (prev & bit) !== 0n ? prev & ~bit : prev | bit);
  };

  const sortedRoles = [...roles].sort((a: any, b: any) => b.position - a.position);
  const filteredRoles = sortedRoles.filter((r: any) =>
    roleSearch.trim() === '' || r.name.toLowerCase().includes(roleSearch.toLowerCase())
  );
  const permGroups = PERMISSION_DEFS.reduce<Record<string, typeof PERMISSION_DEFS>>((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group]!.push(p);
    return acc;
  }, {});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedRoles.findIndex((r: any) => r.id === active.id);
    const newIndex = sortedRoles.findIndex((r: any) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newRoles = arrayMove(sortedRoles, oldIndex, newIndex).map((r: any, i: number) => ({ ...r, position: sortedRoles.length - i }));
    setRoles(newRoles);
    try {
      const positions = newRoles.map((r: any) => ({ id: r.id, position: r.position }));
      await api(`/api/guilds/${guild.id}/roles/positions`, {
        method: 'PATCH',
        body: JSON.stringify(positions),
      });
      updateGuildStore(guild.id, { roles: newRoles });
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className={styles.splitLayout}>
      <div className={styles.splitLeft}>
        <div className={styles.pageTitle}>Rôles</div>
        <button className={styles.primaryBtn} style={{ marginBottom: 12, width: '100%' }} onClick={handleCreate}>
          <Plus size={16} /> Créer un rôle
        </button>
        <div className={styles.roleSearchWrap}>
          <Search size={14} className={styles.roleSearchIcon} />
          <input
            className={styles.roleSearchInput}
            placeholder="Rechercher un rôle..."
            value={roleSearch}
            onChange={(e) => setRoleSearch(e.target.value)}
          />
          {roleSearch && (
            <button className={styles.roleSearchClear} onClick={() => setRoleSearch('')}>
              <XIcon size={12} />
            </button>
          )}
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filteredRoles.map((r: any) => r.id)} strategy={verticalListSortingStrategy}>
            <div className={styles.roleList}>
              {filteredRoles.map((role: any) => (
                <SortableRoleItem
                  key={role.id}
                  role={role}
                  isSelected={selectedRole?.id === role.id}
                  onSelect={selectRole}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {filteredRoles.length === 0 && (
          <div className={styles.roleListEmpty}>Aucun rôle trouvé.</div>
        )}
        {msg && <div className={styles.feedback}>{msg}</div>}
      </div>

      {selectedRole ? (
        <div className={styles.roleEditor}>
          <div className={styles.roleEditorHeader}>
            <div className={styles.roleEditorTitle}>
              <span className={styles.roleColorDot} style={{ width: 14, height: 14, background: selectedRole.color || 'var(--text-muted)' }} />
              <span>{selectedRole.name}</span>
            </div>
            {selectedRole.name !== '@everyone' && (
              <button className={styles.iconBtn} onClick={handleDelete}>
                <Trash2 size={16} />
              </button>
            )}
          </div>

          <div className={styles.roleEditorTabs}>
            {[
              { id: 'display', label: 'Affichage' },
              { id: 'permissions', label: 'Permissions' },
              { id: 'members', label: 'Membres' },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`${styles.roleEditorTab} ${activeRoleTab === tab.id ? styles.roleEditorTabActive : ''}`}
                onClick={() => setActiveRoleTab(tab.id as any)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeRoleTab === 'display' && (
            <div className={styles.roleEditorContent}>
              <div className={styles.fieldLabel}>Nom du rôle</div>
              <input
                className={styles.textInput}
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
              />

              <div className={styles.fieldLabel} style={{ marginTop: 20 }}>Couleur du rôle</div>
              <div className={styles.colorPalette}>
                <div
                  className={`${styles.colorSwatch} ${styles.colorSwatchNone} ${!roleColor ? styles.colorSwatchActive : ''}`}
                  onClick={() => setRoleColor(null)}
                  title="Aucune couleur"
                >
                  <X size={12} />
                </div>
                {DISCORD_COLORS.map((c) => (
                  <div
                    key={c}
                    className={`${styles.colorSwatch} ${roleColor === c ? styles.colorSwatchActive : ''}`}
                    style={{ background: c }}
                    onClick={() => setRoleColor(c)}
                    title={c}
                  />
                ))}
              </div>
              <div className={styles.colorCustomRow}>
                <input
                  type="color"
                  className={styles.colorPicker}
                  value={roleColor || '#000000'}
                  onChange={(e) => setRoleColor(e.target.value)}
                />
                <input
                  className={styles.textInput}
                  value={roleColor || ''}
                  placeholder="#000000"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(val)) setRoleColor(val || null);
                  }}
                  style={{ flex: 1 }}
                />
              </div>

              <div className={styles.roleToggleSection}>
                <div className={styles.roleToggleItem}>
                  <div className={styles.roleToggleInfo}>
                    <div className={styles.roleToggleTitle}>Afficher les membres séparément</div>
                    <div className={styles.roleToggleDesc}>Sépare les membres ayant ce rôle du reste des membres en ligne dans la liste</div>
                  </div>
                  <label className={styles.toggleSwitch}>
                    <input type="checkbox" checked={roleHoist} onChange={(e) => setRoleHoist(e.target.checked)} />
                    <span className={styles.toggleSlider} />
                  </label>
                </div>
                <div className={styles.roleToggleItem}>
                  <div className={styles.roleToggleInfo}>
                    <div className={styles.roleToggleTitle}>Autoriser @mention</div>
                    <div className={styles.roleToggleDesc}>Autorise n'importe qui à mentionner ce rôle même sans la permission de mentionner @everyone</div>
                  </div>
                  <label className={styles.toggleSwitch}>
                    <input type="checkbox" checked={roleMentionable} onChange={(e) => setRoleMentionable(e.target.checked)} />
                    <span className={styles.toggleSlider} />
                  </label>
                </div>
              </div>

              <div className={styles.fieldLabel} style={{ marginTop: 20 }}>Icône du rôle</div>
              <div className={styles.roleIconRow}>
                <div className={styles.roleIconPreview} onClick={() => iconInputRef.current?.click()}>
                  {roleIcon ? (
                    <img src={roleIcon} alt="" className={styles.roleIconImg} />
                  ) : roleUnicodeEmoji ? (
                    <span className={styles.roleIconEmoji}>{roleUnicodeEmoji}</span>
                  ) : (
                    <Upload size={20} />
                  )}
                </div>
                <input ref={iconInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleIconUpload} />
                <div className={styles.roleIconActions}>
                  <button className={styles.secondaryBtn} onClick={() => iconInputRef.current?.click()}>Télécharger une image</button>
                  <button className={styles.secondaryBtn} onClick={() => { setRoleUnicodeEmoji(''); setRoleIcon(null); }}>Supprimer l'icône</button>
                </div>
              </div>

              <div className={styles.actions}>
                <button className={styles.primaryBtn} onClick={handleSave} disabled={saving || !roleName.trim()}>
                  {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
                </button>
              </div>
              {msg && <div className={styles.feedback}>{msg}</div>}
            </div>
          )}

          {activeRoleTab === 'permissions' && (
            <div className={styles.roleEditorContent}>
              {Object.entries(permGroups).map(([group, perms]) => (
                <div key={group} className={styles.permGroup}>
                  <div className={styles.permGroupLabel}>{group}</div>
                  {perms.map((p) => (
                    <div key={p.bit.toString()} className={styles.permRowDiscord}>
                      <div className={styles.permRowInfo}>
                        <span className={styles.permRowLabel}>{p.label}</span>
                        {PERM_DESCRIPTIONS[p.bit.toString()] && (
                          <span className={styles.permRowDesc}>{PERM_DESCRIPTIONS[p.bit.toString()]}</span>
                        )}
                      </div>
                      <label className={styles.toggleSwitch}>
                        <input
                          type="checkbox"
                          checked={(rolePerms & p.bit) !== 0n}
                          onChange={() => togglePerm(p.bit)}
                        />
                        <span className={styles.toggleSlider} />
                      </label>
                    </div>
                  ))}
                </div>
              ))}
              <div className={styles.actions}>
                <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
                </button>
              </div>
              {msg && <div className={styles.feedback}>{msg}</div>}
            </div>
          )}

          {activeRoleTab === 'members' && (
            <div className={styles.roleEditorContent}>
              {roleMembersLoading ? (
                <div className={styles.muted}>Chargement…</div>
              ) : roleMembers.length === 0 ? (
                <div className={styles.muted} style={{ padding: '20px 0' }}>Aucun membre ne possède ce rôle.</div>
              ) : (
                <>
                  <div className={styles.fieldLabel}>{roleMembers.length} membre{roleMembers.length !== 1 ? 's' : ''}</div>
                  <div className={styles.roleMemberList}>
                    {roleMembers.map((m: any) => (
                      <div key={m.user?.id || m.id} className={styles.roleMemberRow}>
                        <div className={styles.memberAvatar}>
                          {m.user?.avatar
                            ? <img src={m.user.avatar} alt="" className={styles.avatarImg} />
                            : (m.user?.username || 'U').slice(0, 1).toUpperCase()
                          }
                        </div>
                        <div className={styles.memberInfo}>
                          <div className={styles.memberName}>{m.nickname || m.user?.username}</div>
                          {m.nickname && <div className={styles.muted} style={{ fontSize: 12 }}>{m.user?.username}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.roleEditorEmpty}>
          <ShieldAlert size={48} className={styles.roleEditorEmptyIcon} />
          <div className={styles.roleEditorEmptyTitle}>Sélectionne un rôle à modifier</div>
          <div className={styles.roleEditorEmptyDesc}>
            Les rôles permettent d'organiser tes membres et de personnaliser leurs permissions sur le serveur.
          </div>
        </div>
      )}
    </div>
  );
}

function EmojisTab({ guild }: { guild: any }) {
  const updateGuildStore = useGuildStore((s) => s.updateGuild);
  const [emojis, setEmojis] = useState<any[]>(guild.emojis || []);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    try {
      const emoji = await api(`/api/guilds/${guild.id}/emojis`, { method: 'POST', body: form as any });
      setEmojis((prev) => [...prev, emoji]);
      updateGuildStore(guild.id, { emojis: [...emojis, emoji] });
      setMsg('Émoji ajouté.');
    } catch (err: any) { setMsg(err.message); }
    e.target.value = '';
  };

  const handleDelete = async (emojiId: string) => {
    try {
      await api(`/api/guilds/${guild.id}/emojis/${emojiId}`, { method: 'DELETE' });
      const updated = emojis.filter((e) => e.id !== emojiId);
      setEmojis(updated);
      updateGuildStore(guild.id, { emojis: updated });
      setSelectedIds((prev) => prev.filter((id) => id !== emojiId));
    } catch (err: any) { setMsg(err.message); }
  };

  const toggleSelect = (id: string) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const selectAllVisible = () => {
    const visible = emojis.map((e) => e.id);
    const allSelected = visible.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !visible.includes(id)) : Array.from(new Set([...selectedIds, ...visible])));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Supprimer ${selectedIds.length} émoji(s) ?`)) return;
    for (const id of [...selectedIds]) {
      try {
        await api(`/api/guilds/${guild.id}/emojis/${id}`, { method: 'DELETE' });
        setEmojis((prev) => prev.filter((e) => e.id !== id));
        setSelectedIds((prev) => prev.filter((sid) => sid !== id));
      } catch (e: any) {
        setMsg(`Erreur pour ${id}: ${e.message}`);
      }
    }
    setMsg('Suppression en masse terminée.');
  };

  return (
    <div>
      <div className={styles.pageTitleRow}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className={styles.pageTitle}>Émojis ({emojis.length}/50)</div>
          <button className={styles.secondaryBtn} onClick={selectAllVisible}>Sélectionner la page</button>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selectedIds.length} sélectionné(s)</div>
          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
              <button className={styles.dangerBtn} onClick={handleBulkDelete}>Supprimer ({selectedIds.length})</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className={styles.primaryBtn} onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Ajouter
          </button>
          <input ref={fileRef} type="file" accept="image/*,image/gif" hidden onChange={handleUpload} />
        </div>
      </div>
      {msg && <div className={styles.feedback}>{msg}</div>}
      <div className={styles.emojiGrid}>
        {emojis.map((emoji) => (
          <div key={emoji.id} className={styles.emojiCard}>
            <div style={{ position: 'absolute', left: 8, top: 8 }}>
              <input type="checkbox" checked={selectedIds.includes(emoji.id)} onChange={() => toggleSelect(emoji.id)} />
            </div>
            <div className={styles.emojiPreview}>
              {emoji.asset ? <img src={emoji.asset} alt={emoji.name} className={styles.emojiImg} /> : <span className={styles.muted}>?</span>}
            </div>
            <div className={styles.emojiName}>{emoji.name}</div>
            <button className={styles.emojiDelete} onClick={() => handleDelete(emoji.id)} title="Supprimer">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {emojis.length === 0 && <div className={styles.muted}>Aucun émoji personnalisé.</div>}
      </div>
    </div>
  );
}

function ChannelsTab({ guild }: { guild: any }) {
  const updateGuildStore = useGuildStore((s) => s.updateGuild);
  const [selectedChannel, setSelectedChannel] = useState<any>(null);
  const [overwrites, setOverwrites] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [addingType, setAddingType] = useState<'role' | 'member'>('role');
  const [addingTarget, setAddingTarget] = useState('');
  const [addingAllow, setAddingAllow] = useState(0n);
  const [addingDeny, setAddingDeny] = useState(0n);
  const [showAddForm, setShowAddForm] = useState(false);

  const loadOverwrites = async (channel: any) => {
    try {
      const data = await api<any>(`/api/channels/${channel.id}`);
      setOverwrites((data.permission_overwrites || []) as any[]);
      setSelectedChannel(data as any);
    } catch (e: any) { setMsg(e.message); }
  };

  const selectChannel = (channel: any) => {
    setShowAddForm(false);
    loadOverwrites(channel);
  };

  const CHANNEL_PERM_DEFS = [
    { bit: 0x400n, label: 'Voir le salon', group: 'Accès' },
    { bit: 0x800n, label: 'Envoyer des messages', group: 'Accès' },
    { bit: 0x40n, label: 'Ajouter des réactions', group: 'Accès' },
    { bit: 0x2000n, label: 'Gérer les messages', group: 'Modération' },
    { bit: 0x4000n, label: 'Intégrer des liens', group: 'Messagerie' },
    { bit: 0x8000n, label: 'Joindre des fichiers', group: 'Messagerie' },
    { bit: 0x10000n, label: 'Voir l\'historique', group: 'Messagerie' },
    { bit: 0x1000n, label: 'Envoyer des messages TTS', group: 'Messagerie' },
    { bit: 0x100000n, label: 'Se connecter', group: 'Vocal' },
    { bit: 0x200000n, label: 'Parler', group: 'Vocal' },
    { bit: 0x400000n, label: 'Rendre muet', group: 'Vocal' },
    { bit: 0x800000n, label: 'Rendre sourd', group: 'Vocal' },
    { bit: 0x1000000n, label: 'Déplacer des membres', group: 'Vocal' },
    { bit: 0x20000000n, label: 'Gérer les webhooks', group: 'Avancé' },
  ];

  const permGroups = CHANNEL_PERM_DEFS.reduce<Record<string, typeof CHANNEL_PERM_DEFS>>((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group]!.push(p);
    return acc;
  }, {});

  const togglePerm = (perm: bigint, allow: boolean) => {
    if (allow) {
      setAddingAllow((prev) => (prev & perm) !== 0n ? prev & ~perm : prev | perm);
    } else {
      setAddingDeny((prev) => (prev & perm) !== 0n ? prev & ~perm : prev | perm);
    }
  };

  const handleAddOverride = async () => {
    if (!selectedChannel || !addingTarget) return;
    setSaving(true);
    try {
      const payload: any = {
        target_id: addingTarget,
        type: addingType,
        allow: addingAllow.toString(),
        deny: addingDeny.toString(),
      };
      const overwrite = await api<any>(`/api/channels/${selectedChannel.id}/permissions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setOverwrites((prev) => {
        const idx = prev.findIndex((o) => o.id === overwrite.id);
        if (idx >= 0) {
          return prev.map((o) => o.id === overwrite.id ? overwrite : o);
        }
        return [...prev, overwrite as any];
      });
      setShowAddForm(false);
      setAddingTarget('');
      setAddingAllow(0n);
      setAddingDeny(0n);
    } catch (e: any) { setMsg(e.message); }
    setSaving(false);
  };

  const handleUpdateOverwrite = async (overwriteId: string, field: 'allow' | 'deny', bit: bigint) => {
    const overwrite = overwrites.find((o) => o.id === overwriteId);
    if (!overwrite) return;
    const current = BigInt(overwrite[field] || '0');
    const updated = (current & bit) !== 0n ? current & ~bit : current | bit;
    try {
      await api(`/api/channels/${selectedChannel.id}/permissions/${overwriteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: updated.toString() }),
      });
      setOverwrites((prev) => prev.map((o) => o.id === overwriteId ? { ...o, [field]: updated.toString() } : o));
    } catch (e: any) { setMsg(e.message); }
  };

  const handleCycleOverwriteBit = async (overwriteId: string, bit: bigint) => {
    const overwrite = overwrites.find((o) => o.id === overwriteId);
    if (!overwrite) return;
    const currentAllow = BigInt(overwrite.allow || '0');
    const currentDeny = BigInt(overwrite.deny || '0');
    const allowed = (currentAllow & bit) !== 0n;
    const denied = (currentDeny & bit) !== 0n;
    const nextAllow = allowed ? (currentAllow & ~bit) : denied ? currentAllow : (currentAllow | bit);
    const nextDeny = allowed ? (currentDeny | bit) : denied ? (currentDeny & ~bit) : currentDeny;
    try {
      await api(`/api/channels/${selectedChannel.id}/permissions/${overwriteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ allow: nextAllow.toString(), deny: nextDeny.toString() }),
      });
      setOverwrites((prev) => prev.map((o) => o.id === overwriteId ? { ...o, allow: nextAllow.toString(), deny: nextDeny.toString() } : o));
    } catch (e: any) { setMsg(e.message); }
  };

  const handleDeleteOverwrite = async (overwriteId: string) => {
    if (!confirm('Supprimer cette permission ?')) return;
    try {
      await api(`/api/channels/${selectedChannel.id}/permissions/${overwriteId}`, { method: 'DELETE' });
      setOverwrites((prev) => prev.filter((o) => o.id !== overwriteId));
    } catch (e: any) { setMsg(e.message); }
  };

  const getRoleName = (targetId: string) => {
    const role = guild.roles?.find((r: any) => r.id === targetId);
    return role ? role.name : targetId;
  };

  const getMemberName = (targetId: string) => {
    const member = guild.members?.find((m: any) => m.user?.id === targetId);
    return member?.user?.username || targetId;
  };

  const sortedChannels = [...(guild.channels || [])].sort((a: any, b: any) => a.position - b.position);
  const overwriteStats = {
    total: overwrites.length,
    role: overwrites.filter((o: any) => o.target_type === 'role').length,
    member: overwrites.filter((o: any) => o.target_type === 'member').length,
    conflicted: overwrites.filter((o: any) => (BigInt(o.allow || '0') & BigInt(o.deny || '0')) !== 0n).length,
  };

  return (
    <div className={styles.splitLayout}>
      <div className={styles.splitLeft}>
        <div className={styles.pageTitle}>Canaux</div>
        <div className={styles.channelList}>
          {sortedChannels.map((channel: any) => (
            <button
              key={channel.id}
              className={`${styles.roleItem} ${selectedChannel?.id === channel.id ? styles.roleItemActive : ''}`}
              onClick={() => selectChannel(channel)}
            >
              <span className={styles.channelIcon}>{channel.type === 4 ? '#' : '#'}</span>
              <span>{channel.name}</span>
            </button>
          ))}
        </div>
        {msg && <div className={styles.feedback}>{msg}</div>}
      </div>

      {selectedChannel && (
        <div className={styles.splitRight}>
          <div className={styles.splitRightHeader}>
            <div className={styles.memberDetailName}># {selectedChannel.name}</div>
          </div>

          <div className={styles.permissionsHealthCard}>
            <div className={styles.permissionsHealthTitle}>Santé des permissions</div>
            <div className={styles.permissionsHealthRow}>
              <span>Overwrites</span>
              <strong>{overwriteStats.total}</strong>
            </div>
            <div className={styles.permissionsHealthRow}>
              <span>Rôles ciblés</span>
              <strong>{overwriteStats.role}</strong>
            </div>
            <div className={styles.permissionsHealthRow}>
              <span>Membres ciblés</span>
              <strong>{overwriteStats.member}</strong>
            </div>
            <div className={styles.permissionsHealthRow}>
              <span>Conflits allow/deny</span>
              <strong className={overwriteStats.conflicted > 0 ? styles.permissionsHealthDanger : undefined}>
                {overwriteStats.conflicted}
              </strong>
            </div>
            {overwriteStats.conflicted > 0 && (
              <div className={styles.permissionsHealthHint}>
                Certains overrides ont les mêmes bits en autorisé et refusé. Nettoyez-les pour éviter des comportements difficiles à lire.
              </div>
            )}
          </div>

          <div className={styles.fieldLabel}>Permissions par défaut</div>
          <div className={styles.overwritesList}>
            <div className={styles.permTableHeader}>
              <span>Utilisateur / Rôle</span>
              <span className={styles.permColHeader}>Autoriser</span>
              <span className={styles.permColHeader}>Refuser</span>
            </div>

            {overwrites.map((ow: any) => (
              <div key={ow.id} className={styles.permTableRow}>
                <span className={styles.overwriteTarget}>
                  {ow.target_type === 'role' ? (
                    <><span className={styles.roleColorDot} style={guild.roles?.find((r: any) => r.id === ow.target_id)?.color ? { background: guild.roles?.find((r: any) => r.id === ow.target_id)?.color } : undefined} />{getRoleName(ow.target_id)}</>
                  ) : (
                    getMemberName(ow.target_id)
                  )}
                </span>
                <div className={styles.permCols}>
                  {Object.entries(permGroups).map(([group, perms]) => (
                    <div key={group} className={styles.permGroupInline}>
                      {perms.map((p) => {
                        const allowed = (BigInt(ow.allow || '0') & p.bit) !== 0n;
                        const denied = (BigInt(ow.deny || '0') & p.bit) !== 0n;
                        return (
                          <div key={p.bit.toString()} className={styles.permCell} onClick={() => handleCycleOverwriteBit(ow.id, p.bit)} title={`${p.label}: cliquer pour changer`}>
                            <span className={`${styles.permBadge} ${allowed ? styles.permAllowed : ''} ${denied ? styles.permDenied : ''}`}>
                              {!allowed && !denied ? '—' : allowed ? '✓' : '✗'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <button className={styles.iconBtn} onClick={() => handleDeleteOverwrite(ow.id)} title="Supprimer"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          {showAddForm ? (
            <div className={styles.addPermForm}>
              <div className={styles.fieldLabel}>Ajouter une permission</div>
              <div className={styles.twoCol}>
                <div>
                  <div className={styles.fieldLabel}>Type</div>
                  <select className={styles.select} value={addingType} onChange={(e) => { setAddingType(e.target.value as 'role' | 'member'); setAddingTarget(''); }}>
                    <option value="role">Rôle</option>
                    <option value="member">Membre</option>
                  </select>
                </div>
                <div>
                  <div className={styles.fieldLabel}>{addingType === 'role' ? 'Rôle' : 'Membre'}</div>
                  {addingType === 'role' ? (
                    <select className={styles.select} value={addingTarget} onChange={(e) => setAddingTarget(e.target.value)}>
                      <option value="">Sélectionner…</option>
                      {guild.roles?.filter((r: any) => r.name !== '@everyone').map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  ) : (
                    <select className={styles.select} value={addingTarget} onChange={(e) => setAddingTarget(e.target.value)}>
                      <option value="">Sélectionner…</option>
                      {guild.members?.map((m: any) => <option key={m.user?.id} value={m.user?.id}>{m.user?.username}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div className={styles.fieldLabel} style={{ marginTop: 12 }}>Autoriser</div>
              <div className={styles.permToggleGrid}>
                {CHANNEL_PERM_DEFS.map((p) => (
                  <label key={p.bit.toString()} className={styles.permRow} onClick={() => togglePerm(p.bit, true)}>
                    <div className={`${styles.permCheck} ${(addingAllow & p.bit) !== 0n ? styles.permCheckOn : ''}`}>
                      {(addingAllow & p.bit) !== 0n && <Check size={12} />}
                    </div>
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
              <div className={styles.fieldLabel}>Refuser</div>
              <div className={styles.permToggleGrid}>
                {CHANNEL_PERM_DEFS.map((p) => (
                  <label key={p.bit.toString()} className={styles.permRow} onClick={() => togglePerm(p.bit, false)}>
                    <div className={`${styles.permCheck} ${(addingDeny & p.bit) !== 0n ? styles.permCheckOn : ''}`}>
                      {(addingDeny & p.bit) !== 0n && <Check size={12} />}
                    </div>
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
              <div className={styles.actions}>
                <button className={styles.primaryBtn} onClick={handleAddOverride} disabled={saving || !addingTarget}>Ajouter</button>
                <button className={styles.secondaryBtn} onClick={() => setShowAddForm(false)}>Annuler</button>
              </div>
            </div>
          ) : (
            <button className={styles.primaryBtn} style={{ marginTop: 12 }} onClick={() => setShowAddForm(true)}>
              <Plus size={16} /> Ajouter une permission
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InvitesTab({ guild }: { guild: any }) {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [newCode, setNewCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  useEffect(() => {
    api(`/api/guilds/${guild.id}/invites`)
      .then((d: any) => setInvites(d.invites || []))
      .catch((e: any) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [guild.id]);

  const toggleSelect = (code: string) => {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const selectAllVisible = () => {
    const visible = invites.map((i) => i.code).filter(Boolean);
    const allSelected = visible.every((c) => selectedCodes.includes(c));
    setSelectedCodes(allSelected ? selectedCodes.filter((c) => !visible.includes(c)) : Array.from(new Set([...selectedCodes, ...visible])));
  };

  const handleCreate = async () => {
    const defaultChannel = guild.channels.find((c: any) => c.type === 0);
    if (!defaultChannel) return;
    setCreating(true);
    try {
      const invite = await api<any>(`/api/guilds/${guild.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({ channel_id: defaultChannel.id, max_age: 86400 }),
      });
      setInvites((prev) => [invite as any, ...prev]);
      setNewCode(invite.code as string);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(invite.code as string);
      setMsg('Invitation créée et copiée.');
    } catch (e: any) { setMsg(e.message); }
    setCreating(false);
  };

  const handleRevoke = async (code: string) => {
    try {
      await api(`/api/invites/${code}`, { method: 'DELETE' });
      setInvites((prev) => prev.filter((i) => i.code !== code));
      setSelectedCodes((prev) => prev.filter((c) => c !== code));
    } catch (e: any) { setMsg(e.message); }
  };

  const handleBulkRevoke = async () => {
    if (selectedCodes.length === 0) return;
    if (!confirm(`Révoquer ${selectedCodes.length} invitation(s) ?`)) return;
    for (const code of [...selectedCodes]) {
      try {
        await api(`/api/invites/${code}`, { method: 'DELETE' });
        setInvites((prev) => prev.filter((i) => i.code !== code));
        setSelectedCodes((prev) => prev.filter((c) => c !== code));
      } catch (e: any) {
        setMsg(`Erreur pour ${code}: ${e.message}`);
      }
    }
    setMsg('Révocation en masse terminée.');
  };

  return (
    <div>
      <div className={styles.pageTitleRow}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className={styles.pageTitle}>Invitations</div>
          <button className={styles.secondaryBtn} onClick={selectAllVisible}>Sélectionner la page</button>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selectedCodes.length} sélectionné(s)</div>
          {selectedCodes.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
              <button className={styles.dangerBtn} onClick={handleBulkRevoke}>Révoquer ({selectedCodes.length})</button>
            </div>
          )}
        </div>

        <button className={styles.primaryBtn} onClick={handleCreate} disabled={creating}>
          <Plus size={16} /> Créer une invitation
        </button>
      </div>
      {newCode && (
        <div className={styles.codeRow}>
          <code className={styles.codeBlock}>{newCode}</code>
          <button className={styles.iconBtn} onClick={() => navigator.clipboard?.writeText(newCode)} title="Copier">
            <Check size={14} />
          </button>
        </div>
      )}
      {msg && <div className={styles.feedback}>{msg}</div>}
      {loading ? <div className={styles.muted}>Chargement…</div> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 24 }}><input type="checkbox" checked={invites.length > 0 && invites.every(i => selectedCodes.includes(i.code))} onChange={selectAllVisible} /></th>
              <th>Code</th>
              <th>Canal</th>
              <th>Créateur</th>
              <th>Utilisations</th>
              <th>Expire</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => {
              const channel = guild.channels.find((c: any) => c.id === inv.channel_id);
              return (
                <tr key={inv.code}>
                  <td><input type="checkbox" checked={selectedCodes.includes(inv.code)} onChange={() => toggleSelect(inv.code)} style={{ marginRight: 8 }} /></td>
                  <td><code>{inv.code}</code></td>
                  <td>#{channel?.name || '—'}</td>
                  <td>{inv.inviter?.username || '—'}</td>
                  <td>{inv.uses}{inv.max_uses ? `/${inv.max_uses}` : ''}</td>
                  <td>{inv.expires_at ? format(new Date(inv.expires_at), 'dd/MM/yyyy HH:mm') : '∞'}</td>
                  <td>
                    <button className={styles.iconBtn} onClick={() => handleRevoke(inv.code)} title="Révoquer">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {invites.length === 0 && <tr><td colSpan={7} className={styles.muted}>Aucune invitation active.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ModerationTab({ guild }: { guild: any }) {
  const [bans, setBans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    api(`/api/guilds/${guild.id}/bans`)
      .then((d: any) => setBans(Array.isArray(d) ? d : []))
      .catch((e: any) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [guild.id]);

  const toggleSelect = (id: string) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  const selectAllVisible = () => {
    const visible = filtered.map((b) => b.user?.id || b.user_id).filter(Boolean) as string[];
    const allSelected = visible.length > 0 && visible.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !visible.includes(id)) : Array.from(new Set([...selectedIds, ...visible])));
  };

  const handleUnban = async (userId: string) => {
    try {
      await api(`/api/guilds/${guild.id}/bans/${userId}`, { method: 'DELETE' });
      setBans((prev) => prev.filter((b) => (b.user?.id || b.user_id) !== userId));
      setSelectedIds((prev) => prev.filter((id) => id !== userId));
      setMsg('Utilisateur débanni.');
    } catch (e: any) { setMsg(e.message); }
  };

  const handleBulkUnban = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Débannir ${selectedIds.length} utilisateur(s) ?`)) return;
    for (const id of [...selectedIds]) {
      try {
        await api(`/api/guilds/${guild.id}/bans/${id}`, { method: 'DELETE' });
        setBans((prev) => prev.filter((b) => (b.user?.id || b.user_id) !== id));
        setSelectedIds((prev) => prev.filter((sid) => sid !== id));
      } catch (e: any) {
        setMsg(`Erreur pour ${id}: ${e.message}`);
      }
    }
    setMsg('Débannement en masse terminé.');
  };

  const filtered = bans.filter((b) => b.user?.username?.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div className={styles.pageTitleRow}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className={styles.pageTitle}>Modération — Bannissements ({bans.length})</div>
          <button className={styles.secondaryBtn} onClick={selectAllVisible}>Sélectionner la page</button>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selectedIds.length} sélectionné(s)</div>
          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
              <button className={styles.dangerBtn} onClick={handleBulkUnban}>Débannir ({selectedIds.length})</button>
            </div>
          )}
        </div>
      </div>

      {msg && <div className={styles.feedback}>{msg}</div>}
      <input className={styles.textInput} placeholder="Rechercher un utilisateur banni…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
      {loading ? <div className={styles.muted}>Chargement…</div> : (
        <div className={styles.banList}>
          {filtered.map((ban) => {
            const id = ban.user?.id || ban.user_id;
            return (
              <div key={id || ban.id} className={styles.banRow}>
                <div style={{ width: 24, display: 'flex', alignItems: 'center' }}>
                  <input type="checkbox" checked={!!id && selectedIds.includes(id)} onChange={() => id && toggleSelect(id)} style={{ marginRight: 8 }} />
                </div>
                <div className={styles.memberAvatar}>
                  {ban.user?.avatar ? <img src={ban.user.avatar} alt="" className={styles.avatarImg} /> : (ban.user?.username || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className={styles.memberInfo}>
                  <div className={styles.memberName}>{ban.user?.username || ban.user_id}</div>
                  {ban.reason && <div className={styles.muted} style={{ fontSize: 12 }}>Raison : {ban.reason}</div>}
                </div>
                <button className={styles.secondaryBtn} onClick={() => handleUnban(id)}>
                  Débannir
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && <div className={styles.muted}>Aucun utilisateur banni.</div>}
        </div>
      )}
    </div>
  );
}

function AutoModTab({ guild }: { guild: any }) {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [creating, setCreating] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newTriggerType, setNewTriggerType] = useState(1);
  const [newKeywords, setNewKeywords] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api(`/api/guilds/${guild.id}/automod/rules`)
      .then((d: any) => setRules(d.rules || []))
      .catch((e: any) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [guild.id]);

  const handleToggle = async (rule: any) => {
    try {
      const updated = await api(`/api/guilds/${guild.id}/automod/rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      setRules((prev) => prev.map((r) => r.id === rule.id ? updated : r));
    } catch (e: any) { setMsg(e.message); }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Supprimer cette règle AutoMod ?')) return;
    try {
      await api(`/api/guilds/${guild.id}/automod/rules/${ruleId}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (e: any) { setMsg(e.message); }
  };

  const handleCreate = async () => {
    if (!newRuleName.trim()) return;
    setCreating(true);
    const keywords = newKeywords.split(',').map((k) => k.trim()).filter(Boolean);
    try {
      const rule = await api(`/api/guilds/${guild.id}/automod/rules`, {
        method: 'POST',
        body: JSON.stringify({
          name: newRuleName,
          trigger_type: newTriggerType,
          trigger_metadata: newTriggerType === 1 ? { keyword_filter: keywords } : newTriggerType === 4 ? { presets: [1, 2, 3] } : {},
          actions: [{ type: 1 }],
        }),
      });
      setRules((prev) => [...prev, rule]);
      setShowCreate(false);
      setNewRuleName('');
      setNewKeywords('');
    } catch (e: any) { setMsg(e.message); }
    setCreating(false);
  };

  return (
    <div>
      <div className={styles.pageTitleRow}>
        <div className={styles.pageTitle}>AutoMod ({rules.length}/6 règles)</div>
        {rules.length < 6 && (
          <button className={styles.primaryBtn} onClick={() => setShowCreate(!showCreate)}>
            <Plus size={16} /> Nouvelle règle
          </button>
        )}
      </div>

      {showCreate && (
        <div className={styles.card} style={{ marginBottom: 16 }}>
          <div className={styles.fieldLabel}>Nom de la règle</div>
          <input className={styles.textInput} value={newRuleName} onChange={(e) => setNewRuleName(e.target.value)} placeholder="Ex : Filtrer les insultes" />

          <div className={styles.fieldLabel} style={{ marginTop: 12 }}>Type de déclencheur</div>
          <div className={styles.selectWrap}>
            <select className={styles.select} value={newTriggerType} onChange={(e) => setNewTriggerType(Number(e.target.value))}>
              <option value={1}>Mots-clés personnalisés</option>
              <option value={3}>Contenu indésirable (spam)</option>
              <option value={4}>Contenu prédéfini (insultes, contenu adulte…)</option>
              <option value={5}>Mentions excessives</option>
            </select>
            <ChevronDown size={14} className={styles.selectIcon} />
          </div>

          {newTriggerType === 1 && (
            <>
              <div className={styles.fieldLabel} style={{ marginTop: 12 }}>Mots-clés (séparés par des virgules)</div>
              <input className={styles.textInput} value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} placeholder="mot1, mot2, *fin*" />
            </>
          )}

          <div className={styles.actions} style={{ marginTop: 12 }}>
            <button className={styles.secondaryBtn} onClick={() => setShowCreate(false)}>Annuler</button>
            <button className={styles.primaryBtn} onClick={handleCreate} disabled={creating || !newRuleName.trim()}>
              {creating ? 'Création…' : 'Créer'}
            </button>
          </div>
        </div>
      )}

      {msg && <div className={styles.feedback}>{msg}</div>}
      {loading ? <div className={styles.muted}>Chargement…</div> : (
        <div>
          {rules.map((rule) => (
            <div key={rule.id} className={styles.ruleCard}>
              <div className={styles.ruleInfo}>
                <div className={styles.ruleName}>{rule.name}</div>
                <div className={styles.muted}>{AUTOMOD_TRIGGER_LABELS[rule.trigger_type] || `Type ${rule.trigger_type}`}</div>
                {rule.trigger_type === 1 && rule.trigger_metadata?.keyword_filter?.length > 0 && (
                  <div className={styles.keywordList}>
                    {rule.trigger_metadata.keyword_filter.map((k: string) => <span key={k} className={styles.keyword}>{k}</span>)}
                  </div>
                )}
              </div>
              <div className={styles.ruleActions}>
                <button
                  className={`${styles.toggleBtn} ${rule.enabled ? styles.toggleBtnOn : ''}`}
                  onClick={() => handleToggle(rule)}
                  title={rule.enabled ? 'Désactiver' : 'Activer'}
                >
                  {rule.enabled ? 'Activé' : 'Désactivé'}
                </button>
                <button className={styles.iconBtn} onClick={() => handleDelete(rule.id)} title="Supprimer">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {rules.length === 0 && <div className={styles.muted}>Aucune règle AutoMod configurée.</div>}
        </div>
      )}
    </div>
  );
}

function AuditLogTab({ guild }: { guild: any }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => {
    const url = filterAction ? `/api/guilds/${guild.id}/audit-logs?action_type=${filterAction}&limit=100` : `/api/guilds/${guild.id}/audit-logs?limit=100`;
    api(url)
      .then((d: any) => setLogs(d.audit_log_entries || []))
      .catch((e: any) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [guild.id, filterAction]);

  const actionOptions = [
    { value: '', label: 'Tous' },
    { value: 'MEMBER_KICK', label: 'Expulsion' },
    { value: 'MEMBER_BAN_ADD', label: 'Bannissement' },
    { value: 'CHANNEL_CREATE', label: 'Canal créé' },
    { value: 'CHANNEL_DELETE', label: 'Canal supprimé' },
    { value: 'CHANNEL_UPDATE', label: 'Canal modifié' },
    { value: 'ROLE_CREATE', label: 'Rôle créé' },
    { value: 'ROLE_DELETE', label: 'Rôle supprimé' },
    { value: 'ROLE_UPDATE', label: 'Rôle modifié' },
    { value: 'MESSAGE_DELETE', label: 'Message supprimé' },
    { value: 'INVITE_CREATE', label: 'Invitation créée' },
    { value: 'INVITE_DELETE', label: 'Invitation supprimée' },
  ];

  return (
    <div>
      <div className={styles.pageTitle}>Journal d'audit</div>
      <div className={styles.filterRow}>
        <select className={styles.select} value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
          {actionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {msg && <div className={styles.feedback}>{msg}</div>}
      {loading ? <div className={styles.muted}>Chargement…</div> : (
        <div>
          {logs.map((log) => (
            <div key={log.id} className={styles.logRow}>
              <div className={styles.logUser}>
                <div className={styles.memberAvatar}>
                  {log.user?.avatar ? <img src={log.user.avatar} alt="" className={styles.avatarImg} /> : (log.user?.username || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>{log.user?.username || 'Inconnu'}</span>
                  <span className={styles.logAction}>{AUDIT_ACTION_LABELS[log.action_type] || log.action_type}</span>
                  {log.target_id && <span className={styles.muted}> → {log.target_id}</span>}
                </div>
              </div>
              <div className={styles.logTime}>{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}</div>
            </div>
          ))}
          {logs.length === 0 && <div className={styles.muted}>Aucune action enregistrée.</div>}
        </div>
      )}
    </div>
  );
}

function IntegrationsTab({ guild }: { guild: any }) {
  const selectableChannels = guild.channels.filter((channel: any) => channel.type === 0 || channel.type === 5 || channel.type === 11 || channel.type === 15);
  const [selectedChannelId, setSelectedChannelId] = useState(selectableChannels[0]?.id || '');
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadWebhooks = async (channelId: string) => {
    if (!channelId) {
      setWebhooks([]);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const data = await api<{ webhooks: any[] }>(`/api/channels/${channelId}/webhooks`);
      setWebhooks(data.webhooks || []);
    } catch (err: any) {
      setMessage(err.message || 'Impossible de charger les webhooks.');
      setWebhooks([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadWebhooks(selectedChannelId);
  }, [selectedChannelId]);

  const handleCreate = async () => {
    if (!selectedChannelId) return;
    setLoading(true);
    setMessage('');
    try {
      await api(`/api/channels/${selectedChannelId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() || 'Webhook' }),
      });
      setName('');
      setMessage('Webhook créé.');
      await loadWebhooks(selectedChannelId);
    } catch (err: any) {
      setMessage(err.message || 'Impossible de créer le webhook.');
    }
    setLoading(false);
  };

  const handleDelete = async (webhookId: string) => {
    try {
      await api(`/api/webhooks/${webhookId}`, { method: 'DELETE' });
      setWebhooks((prev) => prev.filter((webhook) => webhook.id !== webhookId));
    } catch (err: any) {
      setMessage(err.message || 'Impossible de supprimer le webhook.');
    }
  };

  return (
    <div>
      <div className={styles.pageTitle}>Intégrations</div>
      <div className={styles.card}>
        <div className={styles.fieldLabel}>Salon</div>
        <div className={styles.selectWrap}>
          <select className={styles.select} value={selectedChannelId} onChange={(e) => setSelectedChannelId(e.target.value)}>
            {selectableChannels.map((channel: any) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldLabel} style={{ marginTop: 16 }}>Créer un webhook</div>
        <div className={styles.cardRow}>
          <input
            className={styles.textInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du webhook"
            style={{ flex: 1 }}
          />
          <button className={styles.primaryBtn} onClick={handleCreate} disabled={loading || !selectedChannelId}>
            Créer
          </button>
        </div>
        {message && <div className={styles.muted} style={{ marginTop: 12 }}>{message}</div>}
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.fieldLabel}>Webhooks existants</div>
        {loading ? (
          <div className={styles.muted}>Chargement…</div>
        ) : webhooks.length === 0 ? (
          <div className={styles.muted}>Aucun webhook sur ce salon.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {webhooks.map((webhook) => (
              <div key={webhook.id} className={styles.card} style={{ background: 'var(--bg-tertiary)', padding: 12 }}>
                <div className={styles.cardRow}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{webhook.name}</div>
                    <div className={styles.muted} style={{ fontSize: 12 }}>
                      Créé par {webhook.creator?.username || 'inconnu'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={styles.editBtn}
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/${webhook.id}/${webhook.token}`)}
                    >
                      Copier l’URL
                    </button>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(webhook.id)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GuildPluginsTab({ guild }: { guild: any }) {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [savingSlug, setSavingSlug] = useState('');
  const [message, setMessage] = useState('');
  const textChannels = guild.channels.filter((channel: any) => channel.type === 0 || channel.type === 5 || channel.type === 11 || channel.type === 15);

  const loadPlugins = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [catalog, preferences] = await Promise.all([
        api.plugins.list<any[]>(),
        api.plugins.getGuildSettings<any[]>(guild?.id),
      ]);

      const preferenceMap = new Map((preferences || []).map((entry: any) => [entry.plugin.slug, entry]));
      const merged = (catalog || [])
        .filter((plugin: any) => plugin.type === 'SERVER' || plugin.type === 'BOTH')
        .map((plugin: any) => {
          const saved = preferenceMap.get(plugin.slug);
          return {
            plugin,
            enabled: saved?.settings?.enabled ?? plugin.enabled_by_default ?? false,
            settings: saved?.settings?.settings ?? buildDefaultPluginSettings(plugin.settings_schema),
            dirty: false,
          };
        });

      setPlugins(merged);
    } catch (err: any) {
      setMessage(err.message || 'Impossible de charger les plugins du serveur.');
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadPlugins();
  }, [guild.id]);

  const updateLocalPlugin = (slug: string, updater: (current: any) => any) => {
    setPlugins((prev) => prev.map((entry) => entry.plugin.slug === slug ? updater(entry) : entry));
  };

  const savePlugin = async (slug: string, nextState?: any) => {
    const current = nextState || plugins.find((entry) => entry.plugin.slug === slug);
    if (!current) return;

    setSavingSlug(slug);
    setMessage('');
    try {
      const response = await api.plugins.updateGuildSettings<any>(guild?.id, slug, {
        enabled: current.enabled,
        settings: current.settings,
      });

      setPlugins((prev) => prev.map((entry) => entry.plugin.slug === slug ? {
        ...entry,
        enabled: response.enabled,
        settings: response.settings ?? entry.settings,
        dirty: false,
      } : entry));
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

  return (
    <div>
      <div className={styles.pageTitle}>Plugins</div>

      <div className={styles.card}>
        <div className={styles.cardRow}>
          <input
            className={styles.textInput}
            style={{ flex: 1 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un plugin serveur…"
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={showEnabledOnly} onChange={(e) => setShowEnabledOnly(e.target.checked)} />
            Actifs uniquement
          </label>
        </div>
        <div className={styles.muted} style={{ marginTop: 12 }}>
          Activez et configurez les plugins officiels du serveur.
        </div>
        {message && <div className={styles.muted} style={{ marginTop: 12 }}>{message}</div>}
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        {loading ? (
          <div className={styles.muted}>Chargement…</div>
        ) : filteredPlugins.length === 0 ? (
          <div className={styles.muted}>Aucun plugin trouvé.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredPlugins.map((entry) => {
              const schema = parsePluginSchema(entry.plugin.settings_schema);
              const properties = schema && typeof schema.properties === 'object' && schema.properties !== null ? Object.entries(schema.properties as Record<string, any>) : [];
              const isSaving = savingSlug === entry.plugin.slug;

              return (
                <div key={entry.plugin.slug} className={styles.card} style={{ background: 'var(--bg-tertiary)', padding: 16 }}>
                  <div className={styles.cardRow}>
                    <div>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{entry.plugin.icon || '🧩'}</span>
                        <span>{entry.plugin.name}</span>
                      </div>
                      <div className={styles.muted} style={{ fontSize: 12, marginTop: 4 }}>
                        {entry.plugin.description || 'Aucune description.'} · {entry.plugin.type}
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={entry.enabled} onChange={(e) => void handleToggle(entry.plugin.slug, e.target.checked)} disabled={isSaving} />
                      {entry.enabled ? 'Activé' : 'Désactivé'}
                    </label>
                  </div>

                  {properties.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                      {properties.map(([key, definition]) => {
                        const field = definition as Record<string, any>;
                        const value = entry.settings?.[key];
                        const wantsChannelSelect = field.type === 'string' && key.toLowerCase().includes('channel');

                        return (
                          <div key={key}>
                            <div className={styles.fieldLabel}>{field.title || key}</div>
                            {field.type === 'boolean' ? (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
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
                                className={styles.textInput}
                                type="number"
                                min={field.minimum}
                                max={field.maximum}
                                step="0.1"
                                value={typeof value === 'number' ? value : field.default ?? ''}
                                onChange={(e) => updateLocalPlugin(entry.plugin.slug, (current) => ({
                                  ...current,
                                  settings: { ...(current.settings || {}), [key]: Number(e.target.value) },
                                  dirty: true,
                                }))}
                              />
                            ) : wantsChannelSelect ? (
                              <div className={styles.selectWrap}>
                                <select
                                  className={styles.select}
                                  value={typeof value === 'string' ? value : ''}
                                  onChange={(e) => updateLocalPlugin(entry.plugin.slug, (current) => ({
                                    ...current,
                                    settings: { ...(current.settings || {}), [key]: e.target.value },
                                    dirty: true,
                                  }))}
                                >
                                  <option value="">Sélectionner un salon</option>
                                  {textChannels.map((channel: any) => (
                                    <option key={channel.id} value={channel.id}>{channel.name}</option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <input
                                className={styles.textInput}
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
                        <button className={styles.editBtn} onClick={() => void savePlugin(entry.plugin.slug)} disabled={isSaving || !entry.dirty}>
                          {isSaving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DangerTab({ guild, isOwner, removeGuild, selectGuild, close }: { guild: any; isOwner: boolean; removeGuild: any; selectGuild: any; close: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleLeave = async () => {
    setLoading(true);
    try {
      await api(`/api/guilds/${guild.id}/members/@me`, { method: 'DELETE' });
      removeGuild(guild.id);
      selectGuild(null);
      close();
    } catch (e: any) { setMsg(e.message); }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (confirmation !== guild.name) return;
    setLoading(true);
    try {
      await api(`/api/guilds/${guild.id}`, { method: 'DELETE', body: JSON.stringify({ confirmation }) });
      removeGuild(guild.id);
      selectGuild(null);
      close();
    } catch (e: any) { setMsg(e.message); }
    setLoading(false);
  };

  return (
    <div>
      <div className={styles.pageTitle}>{isOwner ? 'Supprimer le serveur' : 'Quitter le serveur'}</div>
      <div className={styles.card}>
        {isOwner ? (
          <>
            <div className={styles.muted} style={{ marginBottom: 12 }}>
              Cette action est irréversible. Tape le nom du serveur <strong>{guild.name}</strong> pour confirmer.
            </div>
            <input
              className={styles.textInput}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={guild.name}
            />
            {msg && <div className={styles.feedback}>{msg}</div>}
            <div className={styles.actions}>
              <button className={styles.dangerBtn} onClick={handleDelete} disabled={loading || confirmation !== guild.name}>
                {loading ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.muted} style={{ marginBottom: 12 }}>
              Tu quitteras définitivement <strong>{guild.name}</strong>. Tu devras être réinvité pour rejoindre à nouveau.
            </div>
            {msg && <div className={styles.feedback}>{msg}</div>}
            <div className={styles.actions}>
              <button className={styles.dangerBtn} onClick={handleLeave} disabled={loading}>
                {loading ? 'Départ…' : 'Quitter le serveur'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
