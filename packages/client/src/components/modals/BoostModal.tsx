import { useState } from 'react';
import { Zap, Star, ChevronDown, X } from 'lucide-react';
import { Modal, modalStyles } from '../Modal/Modal';
import { api } from '../../services/api';
import styles from './BoostModal.module.css';

interface Boost {
  id: string;
  user_id: string;
  guild_id: string;
  tier: number;
  created_at: string;
}

interface GuildBoosts {
  boosts: Boost[];
  total_boosts: number;
  premium_tier: number;
  boost_slots_used: number;
  boost_slots_total: number;
}

interface BoostModalProps {
  guildId: string;
  guildName: string;
  onClose: () => void;
  onBoosted?: () => void;
}

export function BoostModal({ guildId, guildName, onClose, onBoosted }: BoostModalProps) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleBoost = async () => {
    setLoading(true);
    setMsg('');
    try {
      await api.guilds.boost(guildId);
      setMsg('✓ Serveur boosté avec succès !');
      onBoosted?.();
      setTimeout(onClose, 1200);
    } catch (e: any) {
      setMsg(e.message);
    }
    setLoading(false);
  };

  return (
    <Modal onClose={onClose} contentClassName={styles.modalContent}>
      <div className={styles.header}>
        <div className={styles.iconWrap}>
          <Zap size={28} color="#f0b132" />
        </div>
        <div>
          <div className={styles.title}>Booster {guildName}</div>
          <div className={styles.subtitle}>Aidez votre serveur à débloqer des perks Premium</div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
      </div>

      <div className={styles.perks}>
        <div className={styles.perkTitle}>Ce que vous débloquez :</div>
        <div className={styles.perkList}>
          <PerkRow icon="🎨" label="Bannière personnalisée du serveur" />
          <PerkRow icon="📸" label="Icône animé du serveur" />
          <PerkRow icon="🔢" label="Plus de slots de salons" />
          <PerkRow icon="🎤" label="Qualité audio supérieure en vocal" />
          <PerkRow icon="✨" label="Badge sur votre profil" />
        </div>
      </div>

      <div className={styles.guarantee}>
        <Star size={14} />
        Chaque boost compte. Votre serveur grimpe dans le classement.
      </div>

      {msg && <div className={`${styles.msg} ${msg.startsWith('✓') ? styles.msgSuccess : styles.msgError}`}>{msg}</div>}

      <button
        className={styles.boostBtn}
        onClick={handleBoost}
        disabled={loading}
      >
        <Zap size={18} />
        {loading ? '…' : 'Booster ce serveur'}
      </button>
    </Modal>
  );
}

function PerkRow({ icon, label }: { icon: string; label: string }) {
  return (
    <div className={styles.perkRow}>
      <span className={styles.perkIcon}>{icon}</span>
      <span className={styles.perkLabel}>{label}</span>
    </div>
  );
}