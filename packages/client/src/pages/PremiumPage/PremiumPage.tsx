import { useEffect, useState } from 'react';
import { Check, Zap, Sparkles, Crown, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import styles from './PremiumPage.module.css';

interface Tier {
  id: number | string;
  name: string;
  price_monthly?: number;
  price_yearly?: number;
  price_cents?: number;
  description?: string;
  features: string[];
  badge_color?: string;
  max_friends?: number;
  max_servers?: number;
  upload_limit_mb?: number;
  stream_quality?: string;
  currency?: string;
}

interface Subscription {
  tier_id: number;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

const TIER_DETAILS: Record<number, { icon: React.ReactNode; gradient: string; highlight: string }> = {
  0: { icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>, gradient: '#4a5568', highlight: '#718096' },
  1: { icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>, gradient: '#805ad5', highlight: '#9f7aea' },
  2: { icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>, gradient: '#3182ce', highlight: '#63b3ed' },
  3: { icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>, gradient: '#d69e2e', highlight: '#ecc94b' },
};

export function PremiumPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [mySub, setMySub] = useState<Subscription | null>(null);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<{ tiers: Tier[] }>('/api/premium/tiers'),
      api<{ subscription: Subscription }>('/api/premium/subscription').catch(() => ({ subscription: null })),
    ]).then(([t, s]) => {
      setTiers(t.tiers);
      setMySub(s.subscription);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (tierId: number | string) => {
    if (!user) return;
    setSubscribing(tierId);
    setError('');
    try {
      await api('/api/premium/subscribe', {
        method: 'POST',
        body: JSON.stringify({ tier_id: tierId, billing_cycle: billing }),
      });
      const sub = await api<{ subscription: Subscription }>('/api/premium/subscription');
      setMySub(sub.subscription);
    } catch (e: any) {
      setError(e.message);
    }
    setSubscribing(null);
  };

  const handleCancel = async () => {
    if (!confirm('Annuler votre abonnement ?')) return;
    try {
      await api('/api/premium/subscription', { method: 'DELETE' });
      const sub = await api<{ subscription: Subscription }>('/api/premium/subscription').catch(() => ({ subscription: null }));
      setMySub(sub.subscription);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const currentTierId = mySub?.tier_id ?? 0;

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Retour
      </button>

      <div className={styles.header}>
        <div className={styles.badge}>
          <Sparkles size={20} />
          OpenCord Premium
        </div>
        <h1 className={styles.title}>Débloquez le meilleur d'OpenCord</h1>
        <p className={styles.subtitle}>Améliorez votre expérience avec des avantages exclusifs, des perks et plus encore.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.billingToggle}>
        <button
          className={`${styles.toggleBtn} ${billing === 'monthly' ? styles.toggleBtnActive : ''}`}
          onClick={() => setBilling('monthly')}
        >
          Mensuel
        </button>
        <button
          className={`${styles.toggleBtn} ${billing === 'yearly' ? styles.toggleBtnActive : ''}`}
          onClick={() => setBilling('yearly')}
        >
          Annuel <span className={styles.saveBadge}>-40%</span>
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Chargement…</div>
      ) : (
        <>
          <div className={styles.tiersGrid}>
            {tiers.map((tier) => {
              const numericTierId = typeof tier.id === 'number' ? tier.id : Number.parseInt(String(tier.id).replace(/\D+/g, ''), 10) || 1;
              const isCurrent = currentTierId === tier.id || currentTierId === numericTierId;
              const isUpgrade = numericTierId > Number(currentTierId || 0);
              const details = TIER_DETAILS[numericTierId] ?? { icon: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>, gradient: '#4a5568', highlight: '#718096' };
              const monthlyPrice = tier.price_monthly ?? ((tier.price_cents ?? 0) / 100);
              const yearlyPrice = tier.price_yearly ?? Math.round(monthlyPrice * 12 * 0.6 * 100) / 100;
              const perMonth = billing === 'yearly' ? Math.round(yearlyPrice / 12) : monthlyPrice;

              return (
                <div
                  key={tier.id}
                  className={`${styles.tierCard} ${isCurrent ? styles.tierCardCurrent : ''} ${tier.id === 3 ? styles.tierCardFeatured : ''}`}
                  style={{ '--tier-gradient': details.gradient, '--tier-highlight': details.highlight } as React.CSSProperties}
                >
                  {numericTierId === 3 && <div className={styles.featuredLabel}>Le plus populaire</div>}

                  <div className={styles.tierHeader}>
                    <div className={styles.tierEmoji}>{details.icon}</div>
                    <div className={styles.tierName}>{tier.name}</div>
                    <div className={styles.tierPrice}>
                      <span className={styles.priceNum}>{perMonth}{tier.currency || '€'}</span>
                      <span className={styles.pricePer}>/mois</span>
                    </div>
                    {billing === 'yearly' && monthlyPrice > 0 && (
                      <div className={styles.priceWas}>
                        {Math.round(monthlyPrice * 12)}€ / an au lieu de {Math.round(monthlyPrice * 12)}€
                      </div>
                    )}
                  </div>

                  <p className={styles.tierDesc}>{tier.description || 'Débloquez des fonctionnalités premium.'}</p>

                  <ul className={styles.features}>
                    {tier.features.map((f, i) => (
                      <li key={i} className={styles.feature}>
                        <Check size={14} className={styles.featureCheck} />
                        {f}
                      </li>
                    ))}
                    {tier.max_friends && <li className={styles.feature}>
                      <Check size={14} className={styles.featureCheck} />
                      {(tier.max_friends / 1000).toFixed(0)}k amis max
                    </li>}
                    {tier.max_servers && <li className={styles.feature}>
                      <Check size={14} className={styles.featureCheck} />
                      {(tier.max_servers / 1000).toFixed(0)}k serveurs max
                    </li>}
                    {tier.upload_limit_mb && <li className={styles.feature}>
                      <Check size={14} className={styles.featureCheck} />
                      {tier.upload_limit_mb}MB de fichiers
                    </li>}
                    {tier.stream_quality && <li className={styles.feature}>
                      <Check size={14} className={styles.featureCheck} />
                      Qualité {tier.stream_quality}
                    </li>}
                  </ul>

                  <div className={styles.tierAction}>
                    {isCurrent ? (
                      <>
                        <div className={styles.currentBadge}>
                          <Check size={14} /> Abonné
                        </div>
                        {!mySub?.cancel_at_period_end && (
                          <button className={`${styles.btn} ${styles.btnDangerOutline}`} onClick={handleCancel}>
                            Annuler l'abonnement
                          </button>
                        )}
                      </>
                    ) : numericTierId === 0 ? (
                      <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={handleCancel}>
                        Réinitialiser
                      </button>
                    ) : (
                      <button
                        className={`${styles.btn} ${isUpgrade ? styles.btnPrimary : styles.btnSecondary}`}
                        onClick={() => handleSubscribe(tier.id)}
                        disabled={subscribing === tier.id}
                      >
                        {subscribing === tier.id ? '...' : isUpgrade ? "S'abonner" : 'Retrograder'}
                      </button>
                    )}
                  </div>

                  {mySub && mySub.current_period_end && isCurrent && (
                    <div className={styles.renewal}>
                      Renouvelle le {new Date(mySub.current_period_end).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.guarantee}>
            <Crown size={16} />
            Satisfait ou remboursé sous 14 jours — annulez à tout moment
          </div>
        </>
      )}
    </div>
  );
}
