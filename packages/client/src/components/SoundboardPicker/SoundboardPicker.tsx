import { useState, useEffect, useRef } from 'react';
import { Music, Play, Pause, Trash2, Plus, Volume2, X } from 'lucide-react';
import { api } from '../../services/api';
import styles from './SoundboardPicker.module.css';

interface SoundboardPickerProps {
  guildId: string;
  channelId: string;
  onClose: () => void;
}

export function SoundboardPicker({ guildId, channelId, onClose }: SoundboardPickerProps) {
  const [sounds, setSounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetchSounds();
  }, [guildId]);

  const fetchSounds = async () => {
    try {
      setLoading(true);
      const data = await api<any>(`/api/guilds/${guildId}/soundboard-sounds`);
      setSounds(data || []);
    } catch (err) {
      console.error('Failed to fetch soundboard sounds:', err);
    } finally {
      setLoading(false);
    }
  };

  const playSound = async (sound: any) => {
    if (playingId === sound.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    try {
      // Play locally
      if (audioRef.current) {
        audioRef.current.src = sound.file_path;
        audioRef.current.volume = sound.volume || 1.0;
        await audioRef.current.play();
        setPlayingId(sound.id);
      }

      // Notify server to play for others
      await api(`/api/guilds/${guildId}/soundboard-sounds/${sound.id}/play`, {
        method: 'POST',
        body: JSON.stringify({ channel_id: channelId }),
      });
    } catch (err) {
      console.error('Failed to play sound:', err);
    }
  };

  const deleteSound = async (soundId: string) => {
    if (!confirm('Supprimer ce son ?')) return;
    try {
      await api(`/api/guilds/${guildId}/soundboard-sounds/${soundId}`, {
        method: 'DELETE',
      });
      setSounds(prev => prev.filter(s => s.id !== soundId));
    } catch (err) {
      console.error('Failed to delete sound:', err);
    }
  };

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('sound', file);
      formData.append('name', file.name.replace(/\.[^/.]+$/, ''));

      try {
        const sound = await api<any>(`/api/guilds/${guildId}/soundboard-sounds`, {
          method: 'POST',
          body: formData,
          headers: {}, // Let browser set content-type for FormData
        });
        setSounds(prev => [...prev, sound]);
      } catch (err) {
        console.error('Failed to upload sound:', err);
      }
    };
    input.click();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Music size={20} />
            <h3>Soundboard</h3>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>Chargement...</div>
          ) : sounds.length === 0 ? (
            <div className={styles.empty}>Aucun son dans le soundboard.</div>
          ) : (
            <div className={styles.soundGrid}>
              {sounds.map(sound => (
                <div key={sound.id} className={styles.soundItem}>
                  <button
                    className={`${styles.playButton} ${playingId === sound.id ? styles.playing : ''}`}
                    onClick={() => playSound(sound)}
                  >
                    {playingId === sound.id ? <Pause size={24} /> : <Play size={24} />}
                    <span className={styles.soundName}>{sound.name}</span>
                    {sound.emoji && <span className={styles.soundEmoji}>{sound.emoji}</span>}
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={() => deleteSound(sound.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.uploadButton} onClick={handleUpload}>
            <Plus size={16} /> Ajouter un son
          </button>
        </div>
      </div>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
    </div>
  );
}
