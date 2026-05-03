import { Server as SocketServer } from 'socket.io';
import { prisma } from '../utils/prisma.js';
import { GatewayEvents } from '@opencord/shared';

export function setupPresenceGateway(io: SocketServer) {
  io.on('connection', (socket) => {
    socket.on(GatewayEvents.PRESENCE_UPDATE, async (data) => {
      const { user_id, status, custom_status_text, custom_status_emoji, activities } = data;
      
      await prisma.user.update({
        where: { id: user_id },
        data: {
          status,
          custom_status_text,
          custom_status_emoji,
          last_seen_at: new Date(),
        },
      });

      socket.to(`user:${user_id}`).emit(GatewayEvents.PRESENCE_UPDATE, {
        user_id,
        status,
        custom_status_text,
        custom_status_emoji,
        activities,
      });
    });
  });
}
