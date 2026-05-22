import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { createFriendRequestNotification } from './notification.controller.js';

const relationshipUserSelect = {
  id: true,
  username: true,
  discriminator: true,
  avatar: true,
  status: true,
  global_name: true,
  custom_status_text: true,
} as const;

export async function getRelationships(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sent = await prisma.friend.findMany({
      where: { user_id: req.user!.userId },
      include: { target: { select: relationshipUserSelect } },
    });
    const received = await prisma.friend.findMany({
      where: { target_id: req.user!.userId },
      include: { user: { select: relationshipUserSelect } },
    });

    const relationships = [
      ...sent.map((f) => ({ id: f.id, type: f.status, user: f.target })),
      ...received.map((f) => ({ id: f.id, type: f.status === 0 ? 3 : f.status, user: f.user })),
    ];

    res.json({ relationships });
  } catch (err) {
    next(err);
  }
}

export async function sendFriendRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.body.type === 'block' && req.body.user_id) {
      req.params = { ...req.params, userId: req.body.user_id };
      return blockUser(req, res, next);
    }

    const { username, discriminator, user_id } = req.body;
    let target: {
      id: string;
      username: string;
      discriminator: string;
      avatar: string | null;
      status: string;
      global_name: string | null;
      custom_status_text: string | null;
    } | null = null;
    if (user_id) {
      target = await prisma.user.findUnique({
        where: { id: user_id },
        select: relationshipUserSelect,
      });
    } else {
      target = await prisma.user.findFirst({
        where: { username, discriminator },
        select: relationshipUserSelect,
      });
    }
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    if (target.id === req.user!.userId) throw new AppError(400, 'SELF_REQUEST', 'Cannot send friend request to yourself');

    const existing = await prisma.friend.findFirst({
      where: {
        OR: [
          { user_id: req.user!.userId, target_id: target.id },
          { user_id: target.id, target_id: req.user!.userId },
        ],
      },
    });
    if (existing) {
      if (existing.status === 1) throw new AppError(400, 'ALREADY_FRIENDS', 'Already friends');
      if (existing.status === 0 && existing.user_id === req.user!.userId) throw new AppError(400, 'ALREADY_SENT', 'Request already sent');
      if (existing.status === 0 && existing.target_id === req.user!.userId) {
        await prisma.friend.update({ where: { id: existing.id }, data: { status: 1 } });
        const io = getIO();
        if (io) {
          io.to(`user:${req.user!.userId}`).emit(GatewayEvents.RELATIONSHIP_UPDATE, { id: existing.id, type: 1 });
          io.to(`user:${target.id}`).emit(GatewayEvents.RELATIONSHIP_UPDATE, { id: existing.id, type: 1 });
        }
        res.json({ id: existing.id, type: 1, user: target });
        return;
      }
      if (existing.status === 2) {
        throw new AppError(403, 'BLOCKED', 'This user has blocked you or you blocked them');
      }
    }

    // Privacy setting (Discord-like):
    // everyone | friends_of_friends | none
    const [myGuilds, targetGuilds, myFriendsEdges, targetFriendsEdges] = await Promise.all([
      prisma.guildMember.findMany({ where: { user_id: req.user!.userId }, select: { guild_id: true } }),
      prisma.guildMember.findMany({ where: { user_id: target.id }, select: { guild_id: true } }),
      prisma.friend.findMany({
        where: {
          status: 1,
          OR: [
            { user_id: req.user!.userId },
            { target_id: req.user!.userId },
          ],
        },
        select: { user_id: true, target_id: true },
      }),
      prisma.friend.findMany({
        where: {
          status: 1,
          OR: [
            { user_id: target.id },
            { target_id: target.id },
          ],
        },
        select: { user_id: true, target_id: true },
      }),
    ]);

    const myGuildIds = new Set(myGuilds.map((g) => g.guild_id));
    const hasSharedGuild = targetGuilds.some((g) => myGuildIds.has(g.guild_id));

    const myFriendIds = new Set(
      myFriendsEdges.map((edge) => (edge.user_id === req.user!.userId ? edge.target_id : edge.user_id)),
    );
    const targetFriendIds = new Set(
      targetFriendsEdges.map((edge) => (edge.user_id === target.id ? edge.target_id : edge.user_id)),
    );
    const hasMutualFriend = Array.from(myFriendIds).some((id) => targetFriendIds.has(id));

    const policyRow = await prisma.$queryRaw<Array<{ allow_friend_requests_from: string | null }>>`
      SELECT allow_friend_requests_from FROM User WHERE id = ${target.id} LIMIT 1
    `;
    const policy = policyRow[0]?.allow_friend_requests_from || 'everyone';
    if (policy === 'none') {
      throw new AppError(403, 'FRIEND_REQUEST_PRIVACY', 'This user does not accept friend requests');
    }
    if (policy === 'friends_of_friends' && !hasMutualFriend) {
      throw new AppError(403, 'FRIEND_REQUEST_PRIVACY', 'This user only accepts requests from friends of friends');
    }
    if (policy !== 'everyone' && policy !== 'friends_of_friends' && policy !== 'none' && !hasSharedGuild && !hasMutualFriend) {
      throw new AppError(403, 'FRIEND_REQUEST_PRIVACY', 'Friend request not allowed by recipient privacy settings');
    }

    const friend = await prisma.friend.create({
      data: { id: generateSnowflake(), user_id: req.user!.userId, target_id: target.id, status: 0 },
    });

    await createFriendRequestNotification(req.user!.userId, target.id);

    const io = getIO();
    if (io) {
      const requester = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: relationshipUserSelect });
      io.to(`user:${target.id}`).emit(GatewayEvents.RELATIONSHIP_ADD, {
        id: friend.id, type: 3, user: requester,
      });
    }

    res.status(201).json({ id: friend.id, type: 0, user: target });
  } catch (err) {
    next(err);
  }
}

export async function removeFriend(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const friend = await prisma.friend.findFirst({
      where: {
        OR: [
          { user_id: req.user!.userId, target_id: req.params.userId },
          { user_id: req.params.userId, target_id: req.user!.userId },
        ],
      },
    });
    if (!friend) throw new AppError(404, 'NOT_FOUND', 'Relationship not found');

    await prisma.friend.delete({ where: { id: friend.id } });

    const io = getIO();
    if (io) {
      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.RELATIONSHIP_REMOVE, { id: friend.id, user_id: req.params.userId });
      io.to(`user:${req.params.userId}`).emit(GatewayEvents.RELATIONSHIP_REMOVE, { id: friend.id, user_id: req.user!.userId });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function blockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.params.userId === req.user!.userId) throw new AppError(400, 'SELF_BLOCK', 'Cannot block yourself');

    const existing = await prisma.friend.findFirst({
      where: {
        OR: [
          { user_id: req.user!.userId, target_id: req.params.userId },
          { user_id: req.params.userId, target_id: req.user!.userId },
        ],
      },
    });

    if (existing) {
      await prisma.friend.update({ where: { id: existing.id }, data: { user_id: req.user!.userId, target_id: req.params.userId, status: 2 } });
    } else {
      await prisma.friend.create({
        data: { id: generateSnowflake(), user_id: req.user!.userId, target_id: req.params.userId, status: 2 },
      });
    }

    const io = getIO();
    if (io) {
      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.RELATIONSHIP_UPDATE, { id: existing?.id, type: 2, user_id: req.params.userId });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function unblockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const friend = await prisma.friend.findFirst({
      where: { user_id: req.user!.userId, target_id: req.params.userId, status: 2 },
    });
    if (!friend) throw new AppError(404, 'NOT_FOUND', 'Block not found');

    await prisma.friend.delete({ where: { id: friend.id } });

    const io = getIO();
    if (io) {
      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.RELATIONSHIP_REMOVE, { id: friend.id, user_id: req.params.userId });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function acceptFriendRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const friend = await prisma.friend.findFirst({
      where: { user_id: req.params.userId, target_id: req.user!.userId, status: 0 },
    });
    if (!friend) throw new AppError(404, 'NOT_FOUND', 'Friend request not found');

    await prisma.friend.update({ where: { id: friend.id }, data: { status: 1 } });
    const requester = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: relationshipUserSelect,
    });

    const io = getIO();
    if (io) {
      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.RELATIONSHIP_UPDATE, { id: friend.id, type: 1, user_id: req.params.userId });
      io.to(`user:${req.params.userId}`).emit(GatewayEvents.RELATIONSHIP_UPDATE, { id: friend.id, type: 1, user_id: req.user!.userId });
    }

    res.json({ id: friend.id, type: 1, user: requester });
  } catch (err) {
    next(err);
  }
}

export async function declineFriendRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const friend = await prisma.friend.findFirst({
      where: { user_id: req.params.userId, target_id: req.user!.userId, status: 0 },
    });
    if (!friend) throw new AppError(404, 'NOT_FOUND', 'Friend request not found');

    await prisma.friend.delete({ where: { id: friend.id } });

    const io = getIO();
    if (io) {
      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.RELATIONSHIP_REMOVE, { id: friend.id, user_id: req.params.userId });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeOrUnblock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const friend = await prisma.friend.findFirst({
      where: {
        OR: [
          { user_id: req.user!.userId, target_id: req.params.userId },
          { user_id: req.params.userId, target_id: req.user!.userId },
        ],
      },
    });
    if (!friend) throw new AppError(400, 'NOT_FRIENDS', 'You are not friends with this user');

    // Can only unblock your own block
    if (friend.status === 2 && friend.user_id !== req.user!.userId) {
      throw new AppError(403, 'FORBIDDEN', 'You cannot unblock this user');
    }

    await prisma.friend.delete({ where: { id: friend.id } });

    const io = getIO();
    if (io) {
      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.RELATIONSHIP_REMOVE, { id: friend.id, user_id: req.params.userId });
      if (friend.status === 1) {
        io.to(`user:${req.params.userId}`).emit(GatewayEvents.RELATIONSHIP_REMOVE, { id: friend.id, user_id: req.user!.userId });
      }
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getMutualRelationships(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const targetId = req.params.userId;

    // Vérifier les paramètres de confidentialité de la cible
    const targetPrivacy = await prisma.$queryRaw<Array<{ show_mutual_guilds: boolean; show_mutual_friends: boolean }>>`
      SELECT show_mutual_guilds, show_mutual_friends FROM User WHERE id = ${targetId} LIMIT 1
    `;
    
    const showMutualGuilds = targetPrivacy[0]?.show_mutual_guilds ?? true;
    const showMutualFriends = targetPrivacy[0]?.show_mutual_friends ?? true;

    // Amis mutuels (uniquement si autorisé)
    let mutualFriends: Array<{ id: string; username: string; avatar: string | null; global_name: string | null; status: string }> = [];
    if (showMutualFriends) {
      const myFriends = await prisma.friend.findMany({
        where: { status: 1, OR: [{ user_id: req.user!.userId }, { target_id: req.user!.userId }] },
        select: { user_id: true, target_id: true },
      });
      const myFriendIds = new Set(
        myFriends.map((f) => (f.user_id === req.user!.userId ? f.target_id : f.user_id)),
      );

      const targetFriends = await prisma.friend.findMany({
        where: { status: 1, OR: [{ user_id: targetId }, { target_id: targetId }] },
        select: { user_id: true, target_id: true },
      });
      const targetFriendIds = new Set(
        targetFriends.map((f) => (f.user_id === targetId ? f.target_id : f.user_id)),
      );

      const mutualIds = Array.from(myFriendIds).filter((id) => targetFriendIds.has(id));
      if (mutualIds.length > 0) {
        mutualFriends = await prisma.user.findMany({
          where: { id: { in: mutualIds } },
          select: { id: true, username: true, avatar: true, global_name: true, status: true },
        });
      }
    }

    // Serveurs mutuels (uniquement si autorisé)
    let mutualGuilds: Array<{ id: string; name: string; icon: string | null }> = [];
    if (showMutualGuilds) {
      const myGuilds = await prisma.guildMember.findMany({
        where: { user_id: req.user!.userId },
        select: { guild_id: true },
      });
      const myGuildIds = new Set(myGuilds.map((g) => g.guild_id));

      const targetGuilds = await prisma.guildMember.findMany({
        where: { user_id: targetId, guild_id: { in: Array.from(myGuildIds) } },
        include: { guild: { select: { id: true, name: true, icon: true } } },
      });
      mutualGuilds = targetGuilds.map((m) => m.guild);
    }

    res.json({ mutual_friends: mutualFriends, mutual_guilds: mutualGuilds });
  } catch (err) {
    next(err);
  }
}
