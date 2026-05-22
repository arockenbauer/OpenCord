import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

export async function createPoll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { channelId } = req.params;
    const { question, options, duration, allowMultiselect } = req.body;

    if (!question || !options || !Array.isArray(options) || options.length < 2 || options.length > 10) {
      throw new AppError(400, 'INVALID_POLL', 'Poll must have 2-10 options');
    }

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    if (channel.guild_id) {
      const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
      if ((perms & BigInt(0x8000)) === BigInt(0)) { // SEND_MESSAGES
        throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing SEND_MESSAGES');
      }
    }

    const messageId = generateSnowflake();
    const pollId = generateSnowflake();

    const message = await prisma.message.create({
      data: {
        id: messageId,
        channel_id: channelId,
        author_id: req.user!.userId,
        content: '',
        type: 19, // Poll message type
        poll: {
          create: {
            id: pollId,
            question,
            options: JSON.stringify(options),
            duration: duration || 86400,
            allow_multiselect: allowMultiselect || false,
          },
        },
      },
      include: { poll: true, author: true },
    });

    const io = getIO();
    if (io) {
      const room = channel.guild_id ? `guild:${channel.guild_id}` : `dm:${channelId}`;
      io.to(room).emit(GatewayEvents.MESSAGE_CREATE, message);
    }

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

export async function answerPoll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pollId } = req.params;
    const { answerIds } = req.body;

    if (!answerIds || !Array.isArray(answerIds) || answerIds.length === 0) {
      throw new AppError(400, 'INVALID_ANSWER', 'Must provide answer IDs');
    }

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { message: { include: { channel: true } } },
    });

    if (!poll) throw new AppError(404, 'NOT_FOUND', 'Poll not found');
    if (poll.ended_at) throw new AppError(400, 'POLL_ENDED', 'Poll has ended');

    const options = JSON.parse(poll.options);
    for (const answerId of answerIds) {
      if (typeof answerId !== 'number' || answerId < 0 || answerId >= options.length) {
        throw new AppError(400, 'INVALID_ANSWER', 'Invalid answer ID');
      }
    }

    if (!poll.allow_multiselect && answerIds.length > 1) {
      throw new AppError(400, 'SINGLE_CHOICE_ONLY', 'This poll allows only one choice');
    }

    // Check if user already answered
    const existing = await prisma.pollAnswer.findUnique({
      where: { poll_id_user_id: { poll_id: pollId, user_id: req.user!.userId } },
    });

    if (existing) {
      // Update existing answer
      await prisma.pollAnswer.update({
        where: { id: existing.id },
        data: { answer_ids: JSON.stringify(answerIds) },
      });
    } else {
      await prisma.pollAnswer.create({
        data: {
          id: generateSnowflake(),
          poll_id: pollId,
          user_id: req.user!.userId,
          answer_ids: JSON.stringify(answerIds),
        },
      });
    }

    const io = getIO();
    if (io) {
      const room = poll.message.channel.guild_id
        ? `guild:${poll.message.channel.guild_id}`
        : `dm:${poll.message.channel_id}`;
      io.to(room).emit('POLL_VOTE', {
        poll_id: pollId,
        user_id: req.user!.userId,
        answer_ids: answerIds,
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function endPoll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pollId } = req.params;

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { message: { include: { channel: true } } },
    });

    if (!poll) throw new AppError(404, 'NOT_FOUND', 'Poll not found');
    if (poll.ended_at) throw new AppError(400, 'POLL_ENDED', 'Poll already ended');

    // Check permissions
    if (poll.message.channel.guild_id) {
      const perms = await getMemberPermissions(poll.message.channel.guild_id, req.user!.userId);
      if ((perms & BigInt(0x8)) === BigInt(0) && poll.message.author_id !== req.user!.userId) {
        throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing MANAGE_MESSAGES or not author');
      }
    }

    await prisma.poll.update({
      where: { id: pollId },
      data: { ended_at: new Date() },
    });

    const io = getIO();
    if (io) {
      const room = poll.message.channel.guild_id
        ? `guild:${poll.message.channel.guild_id}`
        : `dm:${poll.message.channel_id}`;
      io.to(room).emit('POLL_END', { poll_id: pollId });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function getPollResults(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pollId } = req.params;

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { answers: true },
    });

    if (!poll) throw new AppError(404, 'NOT_FOUND', 'Poll not found');

    const options = JSON.parse(poll.options);
    const results = options.map((option: string, index: number) => {
      const count = poll.answers.filter((answer: any) => {
        const ids = JSON.parse(answer.answer_ids);
        return ids.includes(index);
      }).length;
      return { option, count };
    });

    res.json({
      question: poll.question,
      options: results,
      totalVotes: poll.answers.length,
      ended: !!poll.ended_at,
      allowMultiselect: poll.allow_multiselect,
    });
  } catch (err) {
    next(err);
  }
}
