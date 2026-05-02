import { useState, useEffect } from 'react';
import { X, Copy, Check, Rocket, Lock, Flame, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useUIStore } from '../../stores/uiStore';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import styles from './GuildBoostPage.module.css';

const TIER_THRESHOLDS: [number, number, number, number] = [0, 2, 7, 14];

const TIER_PERKS: Record<number, string[]> = {
  0: ['Accès aux canaux texte et vocal de base', '256 membres maximum'],
  1: [
    '50 emplacements d\'émojis',
    '15 emplacements de stickers',
    'Icône de serveur animée',
    'Audio 128 kbps',
    'Splash du serveur',
  ],
  2: [
    '150 emplacements d\'émojis',
    '30 emplacements de stickers',
    'Bannière du serveur',
    'Audio 256 kbps',
    'Téléversements 50 Mo',
  ],
  3: [
    '250 emplacements d\'émojis',
    '60 emplacements de stickers',
    'URL personnalisable',
    'Bannière animée',
    'Audio 384 kbps',
    'Téléversements 100 Mo',
  ],
};

interface Booster {
  user: { id: string; username: string; discriminator: string; avatar: string | null; global_name: string | null };
  boost_count: number;
  premium_since: string;
}

interface BoostData {
  boosters: Booster[];
  premium_tier: number;
  premium_subscription_count: number;
}

export function GuildBoostPage() {
  const guild = useGuildStore((s) => s.getSelectedGuild());
  const setShowServerSettings = useUIStore((s) => s.setShowServerSettings);
  const currentUser = useAuthStore((s) => s.user);
  const [data, setData] = useState<BoostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!guild) return;
    api.guilds.getBoosters<BoostData>(guild.id).then(setData).catch(() => setLoading(false));
  }, [guild]);

  if (!guild) return null;

  const tier = data?.premium_tier ?? 0;
  const count = data?.premium_subscription_count ?? 0;
  const nextTier = Math.min(tier + 1, 3);
  const boostsForNextTier = (TIER_THRESHOLDS[nextTier] ?? 14) - count;
  const progressPercent = nextTier === tier ? 100 : Math.min((count / (TIER_THRESHOLDS[nextTier] ?? 14)) * 100, 100);

  const handleClose = () => setShowServerSettings(false);
  const handleCopyInvite = async () => {
    const message = `Aidez ${guild.name} à atteindre le niveau ${nextTier} en le boostant ! 🚀`;
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tierBadgeClass = tier === 0 ? styles.tierNone : tier === 1 ? styles.tier1 : tier === 2 ? styles.tier2 : styles.tier3;
  const tierLabel = tier === 0 ? 'Aucun niveau' : `Niveau ${tier}`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Rocket size={20} />
          <span>Avantages de boost</span>
        </div>
        <button className={styles.closeBtn} onClick={handleClose}><X size={20} /></button>
      </div>

      <div className={styles.content}>
        <div className={`${styles.tierBadge} ${tierBadgeClass}`}>
          <Flame size={32} />
          <div className={styles.tierInfo}>
            <span className={styles.tierLabel}>{tierLabel}</span>
            <span className={styles.tierSubtext}>{count} boosts</span>
          </div>
        </div>

        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>
              {nextTier === tier ? 'Niveau maximal atteint !' : `${boostsForNextTier} boost${boostsForNextTier > 1 ? 's' : ''} nécessaires pour le niveau ${nextTier}`}
            </span>
            <span className={styles.progressCount}>{count} / {TIER_THRESHOLDS[nextTier]}</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className={styles.perksSection}>
          <div className={styles.perksGroup}>
            <div className={styles.perksGroupTitle}>Avantages actuels</div>
            {(TIER_PERKS[tier] || []).map(perk => (
              <div key={perk} className={styles.perkItem}>
                <Check size={16} className={styles.perkCheck} />
                <span>{perk}</span>
              </div>
            ))}
          </div>

          {nextTier !== tier && TIER_PERKS[nextTier] && (
            <div className={styles.perksGroup}>
              <div className={styles.perksGroupTitle}>Prochain niveau ({nextTier})</div>
              {TIER_PERKS[nextTier].map(perk => (
                <div key={perk} className={`${styles.perkItem} ${styles.perkLocked}`}>
                  <Lock size={14} />
                  <span>{perk}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className={styles.inviteBtn} onClick={handleCopyInvite}>
          {copied ? <><Check size={16} /> Copié !</> : <><Copy size={16} /> Inviter à booster</>}
        </button>

        {data?.boosters && data.boosters.length > 0 && (
          <div className={styles.boosterWall}>
            <div className={styles.boosterWallTitle}>
              <Sparkles size={16} />
              <span>Booster{data.boosters.length > 1 ? 's' : ''}</span>
            </div>
            <div className={styles.boosterList}>
              {data.boosters.map(booster => (
                <div key={booster.user.id} className={styles.boosterItem}>
                  <div className={styles.boosterAvatar}>
                    {booster.user.avatar ? (
                      <img src={`/uploads/avatars/${booster.user.avatar}`} alt={booster.user.username} />
                    ) : (
                      <div className={styles.boosterAvatarPlaceholder}>
                        {(booster.user.username[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <div className={styles.boosterBadge}>
                      <Flame size={12} />
                    </div>
                  </div>
                  <div className={styles.boosterInfo}>
                    <span className={styles.boosterName}>{booster.user.global_name || booster.user.username}</span>
                    <span className={styles.boosterSince}>
                      Depuis le {format(new Date(booster.premium_since), 'd MMM. yyyy', { locale: fr })}
                    </span>
                  </div>
                  <div className={styles.boosterCount}>
                    {booster.boost_count > 1 ? `${booster.boost_count} boosts` : '1 boost'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
