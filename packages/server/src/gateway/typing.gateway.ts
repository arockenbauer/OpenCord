import { Server as SocketServer } from 'socket.io';
import { GatewayEvents } from '@opencord/shared';

export function setupTypingGateway(io: SocketServer) {
  const typingUsers = new Map<string, NodeJS.Timeout>();

  io.on('connection', (socket) => {
    socket.on(GatewayEvents.TYPING_START, (data) => {
      const { channel_id, user_id } = data;
      const key = `${channel_id}:${user_id}`;
      
      if (typingUsers.has(key)) {
        clearTimeout(typingUsers.get(key));
      }

      socket.to(`channel:${channel_id}`).emit(GatewayEvents.TYPING_START, {
        user_id,
        channel_id,
        timestamp: Date.now(),
      });

      const timeout = setTimeout(() => {
        io.to(`channel:${channel_id}`).emit(GatewayEvents.TYPING_STOP, {
          user_id,
          channel_id,
        });
        typingUsers.delete(key);
      }, 10000);

      typingUsers.set(key, timeout);
    });
  });
}
