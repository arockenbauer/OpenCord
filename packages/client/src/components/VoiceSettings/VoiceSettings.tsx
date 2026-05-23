import { useState, useEffect, useRef } from 'react';
import { Mic, Headphones, Volume2, VolumeX, Radio, Settings } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import styles from './VoiceSettings.module.css';

interface Device {
  deviceId: string;
  label: string;
}

export function VoiceSettings() {
  const [inputDevices, setInputDevices] = useState<Device[]>([]);
  const [outputDevices, setOutputDevices] = useState<Device[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>('');
  const [selectedOutput, setSelectedOutput] = useState<string>('');
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [autoGain, setAutoGain] = useState(true);
  const [vad, setVad] = useState(true);
  const [ptt, setPtt] = useState(false);
  const [regions] = useState<{ id: string; name: string }[]>([
    { id: 'auto', name: 'Automatique' },
    { id: 'europe', name: 'Europe' },
    { id: 'us-east', name: 'États-Unis (Est)' },
    { id: 'us-west', name: 'États-Unis (Ouest)' },
    { id: 'asia', name: 'Asie' },
  ]);
  const [selectedRegion, setSelectedRegion] = useState('auto');

  const {
    inputDeviceId,
    outputDeviceId,
    noiseSuppression: storeNoise,
    echoCancellation: storeEcho,
    autoGainControl: storeAutoGain,
    voiceActivityDetection: storeVad,
    pushToTalk: storePtt,
    selectedRegion: storeRegion,
    setInputDevice,
    setOutputDevice,
    toggleNoiseSuppression,
    toggleEchoCancellation,
    toggleAutoGainControl,
    toggleVoiceActivityDetection,
    togglePushToTalk,
    setRegion,
  } = useVoiceStore(s => ({
    inputDeviceId: s.inputDeviceId,
    outputDeviceId: s.outputDeviceId,
    noiseSuppression: s.noiseSuppression,
    echoCancellation: s.echoCancellation,
    autoGainControl: s.autoGainControl,
    voiceActivityDetection: s.voiceActivityDetection,
    pushToTalk: s.pushToTalk,
    selectedRegion: s.selectedRegion,
    setInputDevice: s.setInputDevice,
    setOutputDevice: s.setOutputDevice,
    toggleNoiseSuppression: s.toggleNoiseSuppression,
    toggleEchoCancellation: s.toggleEchoCancellation,
    toggleAutoGainControl: s.toggleAutoGainControl,
    toggleVoiceActivityDetection: s.toggleVoiceActivityDetection,
    togglePushToTalk: s.togglePushToTalk,
    setRegion: s.setRegion,
  }));

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (inputDeviceId) setSelectedInput(inputDeviceId);
    if (outputDeviceId) setSelectedOutput(outputDeviceId);
    if (storeRegion) setSelectedRegion(storeRegion);
    setNoiseSuppression(storeNoise);
    setEchoCancellation(storeEcho);
    setAutoGain(storeAutoGain);
    setVad(storeVad);
    setPtt(storePtt);
  }, [inputDeviceId, outputDeviceId, storeNoise, storeEcho, storeAutoGain, storeVad, storePtt, storeRegion]);

  const loadDevices = async () => {
    try {
      const streams = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = streams
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}` }));
      const audioOutputs = streams
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Haut-parleur ${d.deviceId.slice(0, 8)}` }));
      setInputDevices(audioInputs);
      setOutputDevices(audioOutputs);
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  };

  const handleInputChange = (deviceId: string) => {
    setSelectedInput(deviceId);
    setInputDevice(deviceId);
  };

  const handleOutputChange = (deviceId: string) => {
    setSelectedOutput(deviceId);
    setOutputDevice(deviceId);
  };

  const handleRegionChange = (regionId: string) => {
    setSelectedRegion(regionId);
    setRegion(regionId === 'auto' ? null : regionId);
  };

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Périphériques</div>

        <div className={styles.field}>
          <label><Mic size={16} /> Entrée (Microphone)</label>
          <select value={selectedInput} onChange={e => handleInputChange(e.target.value)}>
            <option value="">Par défaut</option>
            {inputDevices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label><Headphones size={16} /> Sortie (Haut-parleur)</label>
          <select value={selectedOutput} onChange={e => handleOutputChange(e.target.value)}>
            <option value="">Par défaut</option>
            {outputDevices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Traitement du signal</div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <VolumeX size={16} />
            <div>
              <div className={styles.toggleLabel}>Suppression de bruit</div>
              <div className={styles.toggleDesc}>Réduit les bruits de fond</div>
            </div>
          </div>
          <button
            className={`${styles.toggle} ${noiseSuppression ? styles.toggleActive : ''}`}
            onClick={toggleNoiseSuppression}
          >
            <div className={styles.toggleKnob} />
          </button>
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <Volume2 size={16} />
            <div>
              <div className={styles.toggleLabel}>Annulation d'écho</div>
              <div className={styles.toggleDesc}>Évite l'écho de votre haut-parleur</div>
            </div>
          </div>
          <button
            className={`${styles.toggle} ${echoCancellation ? styles.toggleActive : ''}`}
            onClick={toggleEchoCancellation}
          >
            <div className={styles.toggleKnob} />
          </button>
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <Settings size={16} />
            <div>
              <div className={styles.toggleLabel}>Contrôle automatique du gain</div>
              <div className={styles.toggleDesc}>Ajuste automatiquement le volume du micro</div>
            </div>
          </div>
          <button
            className={`${styles.toggle} ${autoGain ? styles.toggleActive : ''}`}
            onClick={toggleAutoGainControl}
          >
            <div className={styles.toggleKnob} />
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Mode de transmission</div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <Radio size={16} />
            <div>
              <div className={styles.toggleLabel}>Voice Activity Detection (VAD)</div>
              <div className={styles.toggleDesc}>Transmission automatique lorsque vous parlez</div>
            </div>
          </div>
          <button
            className={`${styles.toggle} ${vad ? styles.toggleActive : ''}`}
            onClick={toggleVoiceActivityDetection}
            disabled={ptt}
          >
            <div className={styles.toggleKnob} />
          </button>
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <Radio size={16} />
            <div>
              <div className={styles.toggleLabel}>Push-to-Talk (PTT)</div>
              <div className={styles.toggleDesc}>Transmission en maintenant une touche</div>
            </div>
          </div>
          <button
            className={`${styles.toggle} ${ptt ? styles.toggleActive : ''}`}
            onClick={togglePushToTalk}
            disabled={vad}
          >
            <div className={styles.toggleKnob} />
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Région du serveur</div>
        <div className={styles.field}>
          <select value={selectedRegion} onChange={e => handleRegionChange(e.target.value)}>
            {regions.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
