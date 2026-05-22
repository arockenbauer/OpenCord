import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, Mic, MicOff, Headphones, PhoneOff, Users, Crown, MessageSquare } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { api } from '../../services/api';
import styles from './StageChannelView.module.css';

export function StageChannelView({ guild, channel }: { guild: any; channel: any }) {
  const { t } = useTranslation();
  const [stageInstance, setStageInstance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState('');
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isModerator, setIsModerator] = useState(false);

  const voiceChannelId = useVoiceStore((s) => s.channelId);
  const voiceGuildId = useVoiceStore((s) => s.guildId);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfDeaf = useVoiceStore((s) => s.selfDeaf);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);
  const joinVoiceChannel = useVoiceStore((s) => s.joinVoiceChannel);
  const leaveVoiceChannel = useVoiceStore((s) => s.leaveVoiceChannel);
  const toggleSelfMute = useVoiceStore((s) => s.toggleSelfMute);
  const toggleSelfDeaf = useVoiceStore((s) => s.toggleSelfDeaf);

  const isConnected = voiceGuildId === guild.id && voiceChannelId === channel.id;
  const isOwner = guild.owner_id === useGuildStore((s) => s.getSelectedGuild()?.owner_id);

  useEffect(() => {
    fetchStageInstance();
  }, [channel.id]);

  const fetchStageInstance = async () => {
    try {
      setLoading(true);
      const data = await api<any>(`/api/channels/${channel.id}/stage-instances`);
      setStageInstance(data);
      setTopic(data.topic || '');
    } catch (err: any) {
      if (err.message?.includes('STAGE_NOT_FOUND')) {
        setStageInstance(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const createStage = async () => {
    try {
      const data = await api<any>(`/api/channels/${channel.id}/stage-instances`, {
        method: 'POST',
        body: JSON.stringify({ topic, privacyLevel: 1 }),
      });
      setStageInstance(data);
    } catch (err) {
      console.error('Failed to create stage:', err);
    }
  };

  const updateStage = async () => {
    try {
      const data = await api<any>(`/api/channels/${channel.id}/stage-instances`, {
        method: 'PATCH',
        body: JSON.stringify({ topic }),
      });
      setStageInstance(data);
    } catch (err) {
      console.error('Failed to update stage:', err);
    }
  };

  const deleteStage = async () => {
    try {
      await api(`/api/channels/${channel.id}/stage-instances`, {
        method: 'DELETE',
      });
      setStageInstance(null);
      setTopic('');
    } catch (err) {
      console.error('Failed to delete stage:', err);
    }
  };

  const voiceStates = useGuildStore((s) => s.voiceStates);
  const states = (voiceStates.get(guild.id) || []).filter((state: any) => state.channel_id === channel.id);

  const speakers = states.filter((s: any) => !s.suppress);
  const audience = states.filter((s: any) => s.suppress);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Volume2 size={20} className={styles.headerIcon} />
        <span className={styles.headerName}>{channel.name}</span>
        <div className={styles.headerDivider} />
        <span className={styles.headerTopic}>
          {stageInstance ? 'Stage actif' : 'Stage inactif'}
        </span>
      </div>

      <div className={styles.stageArea}>
        {loading ? (
          <div className={styles.loading}>Chargement...</div>
        ) : !stageInstance ? (
          <div className={styles.inactiveStage}>
            <div className={styles.stageIcon}><Volume2 size={48} /></div>
            <h3>Stage inactif</h3>
            <p>Ce salon Stage est actuellement inactif.</p>
            {isOwner && (
              <div className={styles.stageSetup}>
                <textarea
                  className={styles.topicInput}
                  placeholder="Sujet du Stage..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={3}
                />
                <button className={styles.startButton} onClick={createStage}>
                  Démarrer le Stage
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className={styles.stageInfo}>
              <h3>{stageInstance.topic || 'Stage sans sujet'}</h3>
              <div className={styles.stageActions}>
                {isOwner && (
                  <>
                    <button className={styles.actionButton} onClick={updateStage}>
                      Modifier le sujet
                    </button>
                    <button className={styles.actionButton} onClick={deleteStage}>
                      Terminer le Stage
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className={styles.speakersSection}>
              <h4><MessageSquare size={16} /> Orateurs ({speakers.length})</h4>
              <div className={styles.participantGrid}>
                {speakers.map((state: any) => {
                  const member = guild.members?.find((m: any) => m.user.id === state.user_id);
                  const user = member?.user || { username: 'Utilisateur', avatar: null };
                  const speaking = speakingUserIds.has(user.id);
                  return (
                    <div key={state.user_id} className={`${styles.participant} ${speaking ? styles.speaking : ''}`}>
                      <div className={styles.avatar}>
                        {user.avatar ? <img src={user.avatar} alt="" /> : user.username.slice(0, 1).toUpperCase()}
                        {isOwner && <Crown size={12} className={styles.ownerBadge} />}
                      </div>
                      <div className={styles.participantInfo}>
                        <div className={styles.participantName}>
                          {member?.nickname || user.global_name || user.username}
                        </div>
                        <div className={styles.participantStatus}>
                          {speaking ? 'En train de parler' : 'Orateur'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.audienceSection}>
              <h4><Users size={16} /> Audience ({audience.length})</h4>
              <div className={styles.participantGrid}>
                {audience.map((state: any) => {
                  const member = guild.members?.find((m: any) => m.user.id === state.user_id);
                  const user = member?.user || { username: 'Utilisateur', avatar: null };
                  return (
                    <div key={state.user_id} className={styles.participant}>
                      <div className={styles.avatar}>
                        {user.avatar ? <img src={user.avatar} alt="" /> : user.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div className={styles.participantInfo}>
                        <div className={styles.participantName}>
                          {member?.nickname || user.global_name || user.username}
                        </div>
                        <div className={styles.participantStatus}>Audience</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.controls}>
        {isConnected ? (
          <>
            <button className={styles.controlButton} onClick={toggleSelfMute}>
              {selfMute ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button className={styles.controlButton} onClick={toggleSelfDeaf}>
              <Headphones size={20} />
            </button>
            <button className={styles.leaveButton} onClick={leaveVoiceChannel}>
              <PhoneOff size={20} />
            </button>
          </>
        ) : (
          <button className={styles.joinButton} onClick={() => joinVoiceChannel(guild.id, channel.id)}>
            Rejoindre le Stage
          </button>
        )}
      </div>
    </div>
  );
}
