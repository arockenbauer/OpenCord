import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import styles from './VoiceVideo.module.css';

export function CallControls() {
  const { callStatus, selfMute, selfVideo, endDMCall, toggleSelfMute, toggleSelfVideo } = useVoiceStore();

  if (callStatus !== 'connected') return null;

  return (
    <div className={styles.callControls}>
      <button
        className={`${styles.callControlButton} ${selfMute ? '' : styles.active}`}
        onClick={toggleSelfMute}
        title={selfMute ? 'Activer le micro' : 'Couper le micro'}
      >
        {selfMute ? <MicOff size={20} /> : <Mic size={20} />}
      </button>

      <button
        className={`${styles.callControlButton} ${selfVideo ? styles.active : ''}`}
        onClick={toggleSelfVideo}
        title={selfVideo ? 'Désactiver la caméra' : 'Activer la caméra'}
      >
        {selfVideo ? <Video size={20} /> : <VideoOff size={20} />}
      </button>

      <button
        className={`${styles.callControlButton} ${styles.danger}`}
        onClick={endDMCall}
        title="Raccrocher"
      >
        <PhoneOff size={20} />
      </button>
    </div>
  );
}
