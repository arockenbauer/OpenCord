import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';

// Get notes written by current user
export async function getNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const notes = await prisma.userNote.findMany({
      where: { user_id: userId },
      include: { note_target: { select: { id: true, username: true, discriminator: true, avatar: true } } },
      orderBy: { updated_at: 'desc' },
    });
    res.json({ notes });
  } catch (err) {
    next(err);
  }
}

// Get note for a specific user (written by current user)
export async function getNoteForUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const targetId = req.params.targetId;
    const note = await prisma.userNote.findUnique({
      where: { user_id_note_user_id: { user_id: userId, note_user_id: targetId } },
    });
    res.json({ note: note || null });
  } catch (err) {
    next(err);
  }
}

// Create or update a note for a user
export async function upsertNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const targetId = req.params.targetId;
    const { content } = req.body;
    if (!content || content.trim().length === 0) {
      // Delete note if content is empty
      await prisma.userNote.deleteMany({
        where: { user_id: userId, note_user_id: targetId },
      });
      res.json({ note: null });
      return;
    }
    const note = await prisma.userNote.upsert({
      where: { user_id_note_user_id: { user_id: userId, note_user_id: targetId } },
      create: {
        id: generateSnowflake(),
        user_id: userId,
        note_user_id: targetId,
        note_content: content.trim(),
      },
      update: { note_content: content.trim(), updated_at: new Date() },
    });
    res.json({ note });
  } catch (err) {
    next(err);
  }
}

// Delete a note
export async function deleteNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const targetId = req.params.targetId;
    await prisma.userNote.deleteMany({
      where: { user_id: userId, note_user_id: targetId },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
