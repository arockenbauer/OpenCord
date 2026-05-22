import { create } from 'zustand';
import { Device } from 'mediasoup-client';
import { GatewayEvents } from '@opencord/shared';
import { getSocket } from '../services/socket';

type ProducerInfo = {
  id: string;
  kind: 'audio' | 'video';
  userId?: string;
  user_id?: string;
  channelId?: string;
  channel_id?: string;
};

interface VoiceState {
  guildId: string | null;
  channelId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  isConnecting: boolean;
  error: string | null;
  speakingUserIds: Set<string>;
  joinVoiceChannel: (guildId: string, channelId: string) => void;
  leaveVoiceChannel: () => void;
  setSelfMute: (muted: boolean) => void;
  setSelfDeaf: (deafened: boolean) => void;
  toggleSelfMute: () => void;
  toggleSelfDeaf: () => void;
  handleVoiceServerUpdate: (payload: any) => Promise<void>;
  addProducer: (producer: ProducerInfo) => Promise<void>;
  closeProducer: (producerId: string) => void;
  setSpeaking: (userId: string, speaking: boolean) => void;
  reset: () => void;
}

let device: Device | null = null;
let sendTransport: any = null;
let recvTransport: any = null;
let localStream: MediaStream | null = null;
let audioProducer: any = null;
const consumers = new Map<string, any>();
const remoteAudioElements = new Map<string, HTMLAudioElement>();

function emitWithAck<T>(event: string, payload: any): Promise<T> {
  const socket = getSocket();
  if (!socket) return Promise.reject(new Error('Socket disconnected'));
  return new Promise((resolve, reject) => {
    socket.timeout(10000).emit(event, payload, (err: Error | null, response: any) => {
      if (err) reject(err);
      else if (response?.error) reject(new Error(response.error.message || 'Voice request failed'));
      else resolve(response as T);
    });
  });
}

function stopLocalMedia(): void {
  if (audioProducer && !audioProducer.closed) audioProducer.close();
  audioProducer = null;
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  localStream = null;
}

function closeMedia(): void {
  stopLocalMedia();
  for (const consumer of consumers.values()) {
    if (!consumer.closed) consumer.close();
  }
  consumers.clear();
  for (const element of remoteAudioElements.values()) {
    element.pause();
    element.srcObject = null;
    element.remove();
  }
  remoteAudioElements.clear();
  if (sendTransport && !sendTransport.closed) sendTransport.close();
  if (recvTransport && !recvTransport.closed) recvTransport.close();
  sendTransport = null;
  recvTransport = null;
  device = null;
}

async function ensureDevice(channelId: string): Promise<Device> {
  if (device) return device;
  const caps = await emitWithAck<{ rtpCapabilities: any }>(GatewayEvents.VOICE_GET_RTP_CAPABILITIES, { channel_id: channelId });
  device = new Device();
  await device.load({ routerRtpCapabilities: caps.rtpCapabilities });
  return device;
}

async function createSendTransport(channelId: string, loadedDevice: Device) {
  const { transport } = await emitWithAck<{ transport: any }>(GatewayEvents.VOICE_CREATE_WEBRTC_TRANSPORT, { channel_id: channelId });
  const transportInstance = loadedDevice.createSendTransport(transport);
  transportInstance.on('connect', ({ dtlsParameters }: any, callback: () => void, errback: (err: Error) => void) => {
    emitWithAck(GatewayEvents.VOICE_CONNECT_TRANSPORT, {
      channel_id: channelId,
      transport_id: transport.id,
      dtlsParameters,
    }).then(() => callback()).catch(errback);
  });
  transportInstance.on('produce', ({ kind, rtpParameters, appData }: any, callback: (data: { id: string }) => void, errback: (err: Error) => void) => {
    emitWithAck<{ id: string }>(GatewayEvents.VOICE_PRODUCE, {
      channel_id: channelId,
      transport_id: transport.id,
      kind,
      rtpParameters,
      appData,
    }).then(({ id }) => callback({ id })).catch(errback);
  });
  return transportInstance;
}

async function createRecvTransport(channelId: string, loadedDevice: Device) {
  const { transport } = await emitWithAck<{ transport: any }>(GatewayEvents.VOICE_CREATE_WEBRTC_TRANSPORT, { channel_id: channelId });
  const transportInstance = loadedDevice.createRecvTransport(transport);
  transportInstance.on('connect', ({ dtlsParameters }: any, callback: () => void, errback: (err: Error) => void) => {
    emitWithAck(GatewayEvents.VOICE_CONNECT_TRANSPORT, {
      channel_id: channelId,
      transport_id: transport.id,
      dtlsParameters,
    }).then(() => callback()).catch(errback);
  });
  return transportInstance;
}

async function startLocalAudio(channelId: string, muted: boolean): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia || !sendTransport) return;
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !muted;
  audioProducer = await sendTransport.produce({ track, appData: { mediaTag: 'microphone', channelId } });
}

async function consumeProducer(channelId: string, producer: ProducerInfo): Promise<void> {
  if (!device || !recvTransport || producer.kind !== 'audio' || consumers.has(producer.id)) return;
  const payload = await emitWithAck<any>(GatewayEvents.VOICE_CONSUME, {
    channel_id: channelId,
    transport_id: recvTransport.id,
    producer_id: producer.id,
    rtpCapabilities: device.rtpCapabilities,
  });
  const consumer = await recvTransport.consume({
    id: payload.id,
    producerId: payload.producerId,
    kind: payload.kind,
    rtpParameters: payload.rtpParameters,
  });
  consumers.set(producer.id, consumer);
  const stream = new MediaStream([consumer.track]);
  const audio = new Audio();
  audio.srcObject = stream;
  audio.autoplay = true;
  audio.dataset.producerId = producer.id;
  document.body.appendChild(audio);
  remoteAudioElements.set(producer.id, audio);
  await emitWithAck(GatewayEvents.VOICE_RESUME_CONSUMER, { channel_id: channelId, consumer_id: consumer.id });
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  guildId: null,
  channelId: null,
  selfMute: false,
  selfDeaf: false,
  isConnecting: false,
  error: null,
  speakingUserIds: new Set(),

  joinVoiceChannel: (guildId, channelId) => {
    const socket = getSocket();
    if (!socket) {
      set({ error: 'Socket déconnecté' });
      return;
    }
    set({ guildId, channelId, isConnecting: true, error: null });
    socket.emit(GatewayEvents.VOICE_STATE_UPDATE, {
      guild_id: guildId,
      channel_id: channelId,
      self_mute: get().selfMute,
      self_deaf: get().selfDeaf,
    });
  },

  leaveVoiceChannel: () => {
    const { guildId } = get();
    const socket = getSocket();
    if (socket && guildId) {
      socket.emit(GatewayEvents.VOICE_STATE_UPDATE, { guild_id: guildId, channel_id: null });
    }
    closeMedia();
    set({ guildId: null, channelId: null, isConnecting: false, error: null, speakingUserIds: new Set() });
  },

  setSelfMute: (muted) => {
    const { guildId, channelId, selfDeaf } = get();
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !muted && !selfDeaf; });
    set({ selfMute: muted });
    const socket = getSocket();
    if (socket && guildId && channelId) {
      socket.emit(GatewayEvents.VOICE_STATE_UPDATE, { guild_id: guildId, channel_id: channelId, self_mute: muted, self_deaf: selfDeaf });
    }
  },

  setSelfDeaf: (deafened) => {
    const { guildId, channelId, selfMute } = get();
    for (const audio of remoteAudioElements.values()) audio.muted = deafened;
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !selfMute && !deafened; });
    set({ selfDeaf: deafened });
    const socket = getSocket();
    if (socket && guildId && channelId) {
      socket.emit(GatewayEvents.VOICE_STATE_UPDATE, { guild_id: guildId, channel_id: channelId, self_mute: selfMute, self_deaf: deafened });
    }
  },

  toggleSelfMute: () => get().setSelfMute(!get().selfMute),
  toggleSelfDeaf: () => get().setSelfDeaf(!get().selfDeaf),

  handleVoiceServerUpdate: async (payload) => {
    const channelId = payload.channel_id || payload.channelId;
    if (!channelId) return;
    try {
      closeMedia();
      set({ isConnecting: true, error: null });
      const loadedDevice = await ensureDevice(channelId);
      sendTransport = await createSendTransport(channelId, loadedDevice);
      recvTransport = await createRecvTransport(channelId, loadedDevice);
      await startLocalAudio(channelId, get().selfMute || get().selfDeaf);
      const producers = Array.isArray(payload.producers) ? payload.producers : [];
      await Promise.all(producers.map((producer: ProducerInfo) => consumeProducer(channelId, producer)));
      set({ isConnecting: false, channelId, guildId: payload.guild_id || payload.guildId || get().guildId });
    } catch (err: any) {
      closeMedia();
      set({ isConnecting: false, error: err.message || 'Connexion vocale impossible' });
    }
  },

  addProducer: async (producer) => {
    const channelId = producer.channel_id || producer.channelId || get().channelId;
    if (!channelId || channelId !== get().channelId) return;
    await consumeProducer(channelId, producer);
  },

  closeProducer: (producerId) => {
    const consumer = consumers.get(producerId);
    if (consumer && !consumer.closed) consumer.close();
    consumers.delete(producerId);
    const audio = remoteAudioElements.get(producerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    }
    remoteAudioElements.delete(producerId);
  },

  setSpeaking: (userId, speaking) => set((state) => {
    const next = new Set(state.speakingUserIds);
    if (speaking) next.add(userId);
    else next.delete(userId);
    return { speakingUserIds: next };
  }),

  reset: () => {
    closeMedia();
    set({ guildId: null, channelId: null, isConnecting: false, error: null, speakingUserIds: new Set() });
  },
}));
