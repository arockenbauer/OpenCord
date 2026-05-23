import { useEffect, useRef, useState } from 'react';
import { Video, Monitor, Mic, MicOff, VideoOff, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import { IncomingCallModal } from './IncomingCallModal';
import { CallControls } from './CallControls';
import styles from './VoiceVideo.module.css';

export function VoiceVideo() {
  const {
    guildId,
    channelId,
    callStatus,
    selfMute,
    selfDeaf,
    selfVideo,
    selfScreen,
    toggleSelfMute,
    toggleSelfDeaf,
    toggleSelfVideo,
    toggleSelfScreen,
    leaveVoiceChannel,
    endDMCall,
    remoteProducers,
    speakingUserIds,
  } = useVoiceStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (selfVideo && !localStream) {
      navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
        .then((stream) => {
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch(() => {});
    } else if (!selfVideo && localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [selfVideo]);

  if (!channelId && callStatus === 'idle') return null;

  const videoProducers = Array.from(remoteProducers.values()).filter((p) => p.kind === 'video');
  const audioProducers = Array.from(remoteProducers.values()).filter((p) => p.kind === 'audio');

  return (
    <>
      <IncomingCallModal />
      {callStatus === 'connected' && (
        <div className={styles.container}>
          <div className={styles.videoGrid}>
        {videoProducers.map((producer) => (
          <div key={producer.producerId} className={styles.videoTile}>
            <video
              data-producer-id={producer.producerId}
              autoPlay
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div className={styles.videoLabel}>
              {producer.userId} {speakingUserIds.has(producer.userId) ? '🎤' : ''}
            </div>
          </div>
        ))}
      </div>

      {selfVideo && (
        <div className={styles.localPreview}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
          />
        </div>
      )}

      <div className={styles.controls}>
        <button
          className={`${styles.controlButton} ${selfMute ? '' : styles.active}`}
          onClick={toggleSelfMute}
          title={selfMute ? 'Activer le micro' : 'Couper le micro'}
        >
          {selfMute ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <button
          className={`${styles.controlButton} ${selfDeaf ? '' : styles.active}`}
          onClick={toggleSelfDeaf}
          title={selfDeaf ? 'Activer le son' : 'Couper le son'}
        >
          {selfDeaf ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>

        <button
          className={`${styles.controlButton} ${selfVideo ? styles.active : ''}`}
          onClick={toggleSelfVideo}
          title={selfVideo ? 'Désactiver la caméra' : 'Activer la caméra'}
        >
          {selfVideo ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        <button
          className={`${styles.controlButton} ${selfScreen ? styles.active : ''}`}
          onClick={toggleSelfScreen}
          title={selfScreen ? 'Arrêter le partage' : 'Partager l\'écran'}
        >
          <Monitor size={20} />
        </button>

        <button
          className={`${styles.controlButton} ${styles.danger}`}
          onClick={() => {
            if (guildId) leaveVoiceChannel();
            else endDMCall();
          }}
          title="Raccrocher"
        >
          <PhoneOff size={20} />
        </button>
      </div>
      <CallControls />
    </div>
      )}
    </>
  );
}
