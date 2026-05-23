import { useVoiceStore } from '../../stores/voiceStore';
import { Phone, PhoneOff } from 'lucide-react';
import styles from './VoiceVideo.module.css';

export function IncomingCallModal() {
  const { incomingCall, acceptDMCall, declineDMCall } = useVoiceStore();

  if (!incomingCall) return null;

  return (
    <div className={styles.incomingCallOverlay}>
      <div className={styles.incomingCallModal}>
        <div className={styles.incomingCallAvatar}>
          {incomingCall.callerName.charAt(0).toUpperCase()}
        </div>
        <h3 className={styles.incomingCallTitle}>
          Appel entrant de {incomingCall.callerName}
        </h3>
        <p className={styles.incomingCallSubtitle}>Discord fidèle</p>
        <div className={styles.incomingCallActions}>
          <button
            className={`${styles.callButton} ${styles.declineButton}`}
            onClick={declineDMCall}
            title="Décliner"
          >
            <PhoneOff size={24} />
          </button>
          <button
            className={`${styles.callButton} ${styles.acceptButton}`}
            onClick={acceptDMCall}
            title="Accepter"
          >
            <Phone size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
