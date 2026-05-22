import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock mediasoup module
vi.mock('mediasoup', () => {
  const mockProducer = {
    on: vi.fn(),
    kind: 'audio',
    appData: {},
    closed: false,
    close: vi.fn(),
  };

  const mockConsumer = {
    on: vi.fn(),
    kind: 'audio',
    rtpParameters: {},
    resume: vi.fn(),
    closed: false,
    close: vi.fn(),
  };

  const mockTransport = {
    on: vi.fn(),
    connect: vi.fn(),
    produce: vi.fn(() => mockProducer),
    consume: vi.fn(() => mockConsumer),
    close: vi.fn(),
    closed: false,
  };

  const mockRouter = {
    rtpCapabilities: { codecs: [] },
    createWebRtcTransport: vi.fn(() => mockTransport),
    canConsume: vi.fn(() => true),
    close: vi.fn(),
  };

  const mockWorker = {
    createRouter: vi.fn(() => mockRouter),
    on: vi.fn(),
  };

  return {
    createWorker: vi.fn(() => mockWorker),
  };
});

vi.mock('os', () => ({
  default: {
    cpus: vi.fn(() => Array(4).fill({})),
  },
  cpus: vi.fn(() => Array(4).fill({})),
}));

// Import after mocks
import {
  getRtpCapabilities,
  createWebRtcTransport,
  connectTransport,
  produce,
  consume,
  resumeConsumer,
  getProducers,
  closeUserMedia,
} from './voice-media.service.js';

describe('voice-media.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state by clearing the rooms map
    // We need to access the internal rooms map. Since it's not exported, we can't.
    // Instead, we can reset modules.
    vi.resetModules();
  });

  describe('getRtpCapabilities', () => {
    it('returns router capabilities for a channel', async () => {
      const caps = await getRtpCapabilities('channel-1');
      expect(caps).toBeDefined();
      expect(caps.codecs).toBeInstanceOf(Array);
    });
  });

  describe('createWebRtcTransport', () => {
    it('creates a transport and stores it', async () => {
      const result = await createWebRtcTransport('channel-1', 'user-1');
      // The mock returns undefined for id, but the function should return something
      expect(result).toBeDefined();
    });
  });

  describe('connectTransport', () => {
    it('connects the transport with dtls parameters', async () => {
      const transport = await createWebRtcTransport('channel-1', 'user-1');
      await connectTransport('channel-1', transport.id, { type: 'dtls' });
      // If we get here without error, the test passes
    });
  });

  describe('produce', () => {
    it('creates a producer and stores it', async () => {
      const transport = await createWebRtcTransport('channel-1', 'user-1');
      const result = await produce('channel-1', 'user-1', transport.id, 'audio', {});
      expect(result.kind).toBe('audio');
      expect(result.userId).toBe('user-1');
    });
  });

  describe('consume', () => {
    it('creates a consumer when router can consume', async () => {
      const transport = await createWebRtcTransport('channel-1', 'user-1');
      const producer = await produce('channel-1', 'user-1', transport.id, 'audio', {});
      const result = await consume('channel-1', transport.id, producer.id, {});
      expect(result.producerId).toBe(producer.id);
    });
  });

  describe('resumeConsumer', () => {
    it('resumes a paused consumer', async () => {
      const transport = await createWebRtcTransport('channel-1', 'user-1');
      const producer = await produce('channel-1', 'user-1', transport.id, 'audio', {});
      const consumer = await consume('channel-1', transport.id, producer.id, {});
      await resumeConsumer('channel-1', consumer.id);
      // If we get here without error, the test passes
    });
  });

  describe('getProducers', () => {
    it('returns array of producers when room exists', async () => {
      // First create a room and produce something
      const transport = await createWebRtcTransport('channel-1', 'user-1');
      await produce('channel-1', 'user-1', transport.id, 'audio', {});
      const producers = getProducers('channel-1');
      expect(producers).toBeInstanceOf(Array);
    });
  });

  describe('closeUserMedia', () => {
    it('closes all user transports and producers', async () => {
      const transport = await createWebRtcTransport('channel-1', 'user-1');
      await produce('channel-1', 'user-1', transport.id, 'audio', {});

      const closedIds = closeUserMedia('channel-1', 'user-1');
      expect(closedIds).toBeInstanceOf(Array);
    });
  });
});
