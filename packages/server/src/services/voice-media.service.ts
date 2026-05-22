import os from 'os';
import * as mediasoup from 'mediasoup';

type Worker = Awaited<ReturnType<typeof mediasoup.createWorker>>;
type Router = Awaited<ReturnType<Worker['createRouter']>>;
type WebRtcTransport = Awaited<ReturnType<Router['createWebRtcTransport']>>;
type Producer = Awaited<ReturnType<WebRtcTransport['produce']>>;
type Consumer = Awaited<ReturnType<WebRtcTransport['consume']>>;

interface VoiceRoom {
  channelId: string;
  router: Router;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  userProducers: Map<string, Set<string>>;
  userTransports: Map<string, Set<string>>;
}

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
] as any[];

let workers: Worker[] = [];
let nextWorkerIndex = 0;
const rooms = new Map<string, VoiceRoom>();

async function ensureWorkers(): Promise<void> {
  if (workers.length > 0) return;

  const requested = Number(process.env.MEDIASOUP_NUM_WORKERS || '0');
  const count = Math.max(1, Math.min(requested || os.cpus().length || 1, 4));

  for (let i = 0; i < count; i += 1) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: Number(process.env.MEDIASOUP_RTC_MIN_PORT || 10000),
      rtcMaxPort: Number(process.env.MEDIASOUP_RTC_MAX_PORT || 10100),
      logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'error',
    });
    worker.on('died', () => {
      workers = workers.filter((item) => item !== worker);
    });
    workers.push(worker);
  }
}

async function getRoom(channelId: string): Promise<VoiceRoom> {
  const existing = rooms.get(channelId);
  if (existing) return existing;

  await ensureWorkers();
  const worker = workers[nextWorkerIndex % workers.length]!;
  nextWorkerIndex += 1;
  const router = await worker.createRouter({ mediaCodecs });
  const room: VoiceRoom = {
    channelId,
    router,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    userProducers: new Map(),
    userTransports: new Map(),
  };
  rooms.set(channelId, room);
  return room;
}

function getTransport(room: VoiceRoom, transportId: string): WebRtcTransport {
  const transport = room.transports.get(transportId);
  if (!transport) throw new Error('VOICE_TRANSPORT_NOT_FOUND');
  return transport;
}

function remember<K>(map: Map<K, Set<string>>, key: K, value: string): void {
  const values = map.get(key) || new Set<string>();
  values.add(value);
  map.set(key, values);
}

export async function getRtpCapabilities(channelId: string) {
  const room = await getRoom(channelId);
  return room.router.rtpCapabilities;
}

export async function createWebRtcTransport(channelId: string, userId: string) {
  const room = await getRoom(channelId);
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;
  const transport = await room.router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: Number(process.env.MEDIASOUP_INITIAL_BITRATE || 1_000_000),
  });

  room.transports.set(transport.id, transport);
  remember(room.userTransports, userId, transport.id);

  transport.on('dtlsstatechange', (state) => {
    if (state === 'closed') {
      transport.close();
      room.transports.delete(transport.id);
    }
  });
  transport.on('close', () => {
    room.transports.delete(transport.id);
  });

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    sctpParameters: transport.sctpParameters,
  };
}

export async function connectTransport(channelId: string, transportId: string, dtlsParameters: any) {
  const room = await getRoom(channelId);
  const transport = getTransport(room, transportId);
  await transport.connect({ dtlsParameters });
}

export async function produce(
  channelId: string,
  userId: string,
  transportId: string,
  kind: 'audio' | 'video',
  rtpParameters: any,
  appData?: Record<string, unknown>,
) {
  const room = await getRoom(channelId);
  const transport = getTransport(room, transportId);
  const producer = await transport.produce({ kind, rtpParameters, appData: { ...appData, userId, channelId } });

  room.producers.set(producer.id, producer);
  remember(room.userProducers, userId, producer.id);

  producer.on('transportclose', () => {
    room.producers.delete(producer.id);
  });
  producer.on('close', () => {
    room.producers.delete(producer.id);
  });

  return {
    id: producer.id,
    kind: producer.kind,
    userId,
    channelId,
  };
}

export async function consume(
  channelId: string,
  transportId: string,
  producerId: string,
  rtpCapabilities: any,
) {
  const room = await getRoom(channelId);
  if (!room.router.canConsume({ producerId, rtpCapabilities })) {
    throw new Error('VOICE_CANNOT_CONSUME');
  }

  const transport = getTransport(room, transportId);
  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: true,
  });

  room.consumers.set(consumer.id, consumer);
  consumer.on('transportclose', () => room.consumers.delete(consumer.id));
  consumer.on('producerclose', () => room.consumers.delete(consumer.id));

  return {
    id: consumer.id,
    producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

export async function resumeConsumer(channelId: string, consumerId: string): Promise<void> {
  const room = await getRoom(channelId);
  const consumer = room.consumers.get(consumerId);
  if (!consumer) throw new Error('VOICE_CONSUMER_NOT_FOUND');
  await consumer.resume();
}

export function getProducers(channelId: string) {
  const room = rooms.get(channelId);
  if (!room) return [];
  return Array.from(room.producers.values()).map((producer) => ({
    id: producer.id,
    kind: producer.kind,
    userId: producer.appData.userId,
    channelId,
  }));
}

export function closeUserMedia(channelId: string, userId: string): string[] {
  const room = rooms.get(channelId);
  if (!room) return [];

  const closedProducerIds: string[] = [];
  const producerIds = room.userProducers.get(userId) || new Set<string>();
  for (const producerId of producerIds) {
    const producer = room.producers.get(producerId);
    if (producer && !producer.closed) producer.close();
    room.producers.delete(producerId);
    closedProducerIds.push(producerId);
  }
  room.userProducers.delete(userId);

  const transportIds = room.userTransports.get(userId) || new Set<string>();
  for (const transportId of transportIds) {
    const transport = room.transports.get(transportId);
    if (transport && !transport.closed) transport.close();
    room.transports.delete(transportId);
  }
  room.userTransports.delete(userId);

  if (room.producers.size === 0 && room.transports.size === 0 && room.consumers.size === 0) {
    room.router.close();
    rooms.delete(channelId);
  }

  return closedProducerIds;
}
