import { Server as SocketServer } from 'socket.io';
import { prisma } from '../utils/prisma.js';
import { GatewayEvents } from '@opencord/shared';

export function setupMessageGateway(io: SocketServer) {
  io.on('connection', (socket) => {
    socket.on(GatewayEvents.MESSAGE_CREATE, async (data) => {
      // Message creation is handled via REST API
    });

    socket.on(GatewayEvents.TYPING_START, async (data) => {
      const { channel_id, user_id } = data;
      socket.to(`channel:${channel_id}`).emit(GatewayEvents.TYPING_START, {
        user_id,
        channel_id,
        timestamp: Date.now(),
      });

      setTimeout(() => {
        io.to(`channel:${channel_id}`).emit(GatewayEvents.TYPING_STOP, {
          user_id,
          channel_id,
        });
      }, 10000);
    });
  });
}
