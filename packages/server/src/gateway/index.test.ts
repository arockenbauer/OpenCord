import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  Server: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn(), sockets: { emit: vi.fn() } })),
    sockets: { sockets: new Map(), emit: vi.fn() },
    close: vi.fn(),
    engine: { on: vi.fn() },
  })),
  cors: vi.fn(() => (req: any, res: any, next: any) => next()),
  getIO: vi.fn(),
  setIO: vi.fn(),
}));

vi.mock('socket.io', () => ({ Server: mocks.Server }));
vi.mock('cors', () => ({ default: mocks.cors }));
vi.mock('../utils/prisma.js', () => ({ prisma: {} }));

import { initSocketIO, getIO, setIO } from './index.js';

describe('gateway/index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getIO returns null when not initialized', () => {
    expect(getIO()).toBeNull();
  });

  it('setIO stores the instance', () => {
    const fakeIO: any = { on: vi.fn() };
    setIO(fakeIO);
    expect(getIO()).toBe(fakeIO);
  });

  it('initSocketIO creates server with options', () => {
    const httpServer: any = { on: vi.fn() };
    const io = initSocketIO(httpServer);
    expect(mocks.Server).toHaveBeenCalledWith(httpServer, expect.any(Object));
  });

  it('initSocketIO configures CORS from env', () => {
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    const httpServer: any = { on: vi.fn() };
    initSocketIO(httpServer);
    expect(mocks.Server).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      cors: expect.objectContaining({ origin: 'http://localhost:3000' }),
    }));
    delete process.env.CORS_ORIGIN;
  });
});
