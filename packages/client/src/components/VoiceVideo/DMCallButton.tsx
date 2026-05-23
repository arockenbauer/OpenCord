import { Phone } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import styles from './VoiceVideo.module.css';

export function DMCallButton({ dmChannelId }: { dmChannelId: string }) {
  const { callStatus, initiateDMCall } = useVoiceStore();

  if (callStatus !== 'idle') return null;

  return (
    <button
      className={styles.dmCallButton}
      onClick={() => initiateDMCall(dmChannelId)}
      title="Démarrer un appel"
    >
      <Phone size={18} />
    </button>
  );
}
