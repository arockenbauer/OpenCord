import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import archiver from 'archiver';
import { getIO } from '../gateway/index.js';
import { sendEmail } from '../utils/email.js';
import { AppError } from '../utils/app-error.js';

const EXPORT_DIR = process.env.EXPORT_DIR || './exports';
const EXPORT_EXPIRY_DAYS = 7;
const GRACE_PERIOD_DAYS = 14;

// Ensure export directory exists
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

interface ExportOptions {
  userId: string;
  includeAttachments: boolean;
}

/**
 * Request a data export for a user
 */
export async function requestDataExport(userId: string, password: string, includeAttachments: boolean = false): Promise<{
  export_id: string;
  status: string;
  estimated_size_mb: number;
  created_at: Date;
}> {
  // Verify user exists and password is correct
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

  const valid = await import('bcrypt').then(bc => bc.compare(password, user.password_hash));
  if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid password');

  // Check rate limit: one export per 24 hours
  const recentExport = await prisma.dataExport.findFirst({
    where: {
      user_id: userId,
      created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (recentExport) {
    throw new AppError(429, 'RATE_LIMITED', 'An export was already requested in the last 24 hours');
  }

  // Estimate size
  const [messageCount, attachmentSize] = await Promise.all([
    prisma.message.count({ where: { author_id: userId } }),
    includeAttachments
      ? prisma.attachment.aggregate({
          where: { message: { author_id: userId } },
          _sum: { size: true },
        })
      : Promise.resolve({ _sum: { size: null } }),
  ]);

  const estimatedBytes = (messageCount * 500) + (attachmentSize._sum.size || 0) + 1024 * 1024; // rough estimate
  const estimatedSizeMb = Math.round(estimatedBytes / 1024 / 1024);

  // Create export record
  const exportId = generateSnowflake();
  const expiresAt = new Date(Date.now() + EXPORT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.dataExport.create({
    data: {
      id: exportId,
      user_id: userId,
      status: 'processing',
      include_attachments: includeAttachments,
      expires_at: expiresAt,
    },
  });

  // Start export in background (don't await)
  processExport({ userId, includeAttachments }).catch(async (err) => {
    console.error('Export failed:', err);
    await prisma.dataExport.update({
      where: { id: exportId },
      data: { status: 'failed', error: err.message || 'Unknown error' },
    });
  });

  return {
    export_id: exportId,
    status: 'processing',
    estimated_size_mb: estimatedSizeMb,
    created_at: new Date(),
  };
}

/**
 * Process the export in background
 */
async function processExport(options: ExportOptions): Promise<void> {
  const { userId, includeAttachments } = options;

  const exportRecord = await prisma.dataExport.findFirst({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
  });
  if (!exportRecord) return;

  try {
    const userDir = path.join(EXPORT_DIR, userId);
    if (!fs.existsSync(userDir)) { fs.mkdirSync(userDir, { recursive: true }); }

    const exportBase = path.join(userDir, `export-${exportRecord.id}`);
    if (!fs.existsSync(exportBase)) { fs.mkdirSync(exportBase, { recursive: true }); }

    // 1. Fetch all user data
    const [
      user,
      sessions,
      relationships,
      guildMembers,
      messages,
      reactions,
      badges,
      subscription,
      boosts,
      auditLogs,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, username: true, discriminator: true, email: true,
          date_of_birth: true, bio: true, locale: true, created_at: true,
          status: true, custom_status_text: true, theme: true,
          allow_dms_from: true, allow_friend_requests_from: true,
          show_mutual_guilds: true, show_mutual_friends: true,
        },
      }),
      prisma.refreshToken.findMany({
        where: { user_id: userId },
        select: { device_info: true, ip_address: true, last_used_at: true, created_at: true },
      }),
      prisma.friend.findMany({
        where: { OR: [{ user_id: userId }, { target_id: userId }] },
        include: {
          user: { select: { id: true, username: true, discriminator: true } },
          target: { select: { id: true, username: true, discriminator: true } },
        },
      }),
      prisma.guildMember.findMany({
        where: { user_id: userId },
        include: { guild: { select: { id: true, name: true } } },
      }),
      prisma.message.findMany({
        where: { author_id: userId },
        include: { channel: { select: { id: true, name: true, guild_id: true } },
                  attachments: true },
        orderBy: { created_at: 'asc' },
      }),
      prisma.reaction.findMany({
        where: { user_id: userId },
        include: { message: { select: { id: true, channel_id: true } } },
      }),
      prisma.userBadge.findMany({
        where: { user_id: userId },
        include: { badge: true },
      }),
      prisma.userSubscription.findUnique({ where: { user_id: userId } }),
      prisma.boost.findMany({ where: { user_id: userId }, include: { guild: { select: { id: true, name: true } } } }),
      prisma.auditLog.findMany({
        where: { target_id: userId },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    if (!user) throw new Error('User not found');

    // 2. Create account.json
    const accountData = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      email: user.email,
      date_of_birth: user.date_of_birth?.toISOString().split('T')[0],
      bio: user.bio,
      locale: user.locale,
      created_at: user.created_at.toISOString(),
      settings: {
        status: user.status,
        custom_status_text: user.custom_status_text,
        theme: user.theme,
        privacy: {
          allow_dms_from: user.allow_dms_from,
          allow_friend_requests_from: user.allow_friend_requests_from,
          show_mutual_guilds: user.show_mutual_guilds,
          show_mutual_friends: user.show_mutual_friends,
        },
      },
      sessions: sessions.map(s => ({
        device_info: s.device_info,
        ip_address: s.ip_address,
        last_used_at: s.last_used_at?.toISOString(),
        created_at: s.created_at.toISOString(),
      })),
    };
    fs.writeFileSync(path.join(exportBase, 'account.json'), JSON.stringify(accountData, null, 2));

    // 3. Create relationships.json
    const relationshipsData = relationships.map(r => ({
      id: r.id,
      type: r.status,
      user: r.user_id === userId ? r.target : r.user,
    }));
    fs.writeFileSync(path.join(exportBase, 'relationships.json'), JSON.stringify(relationshipsData, null, 2));

    // 4. Create guilds.json
    const guildsData = guildMembers.map(g => ({
      id: g.guild.id,
      name: g.guild.name,
      joined_at: g.joined_at.toISOString(),
      nickname: g.nickname,
    }));
    fs.writeFileSync(path.join(exportBase, 'guilds.json'), JSON.stringify(guildsData, null, 2));

    // 5. Create messages directory
    const messagesDir = path.join(exportBase, 'messages');
    if (!fs.existsSync(messagesDir)) { fs.mkdirSync(messagesDir, { recursive: true }); }

    // Index of all channels
    const channelIndex: Array<{ channel_id: string; channel_name: string; guild_name?: string; message_count: number }> = [];
    const channelMap = new Map<string, any[]>();

    for (const msg of messages) {
      const channelId = msg.channel_id;
      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, []);
      }
      channelMap.get(channelId)!.push({
        id: msg.id,
        content: msg.content,
        created_at: msg.created_at.toISOString(),
        edited_at: null,
        attachments: msg.attachments.map(a => ({
          filename: a.filename,
          size: a.size,
          url: `files/attachments/${a.filename}`,
        })),
      });
    }

    // Split into guild channels and DMs
    const guildChannelsDir = path.join(messagesDir, 'guild-channels');
    const dmDir = path.join(messagesDir, 'dm');
    if (!fs.existsSync(guildChannelsDir)) { fs.mkdirSync(guildChannelsDir, { recursive: true }); }
    if (!fs.existsSync(dmDir)) { fs.mkdirSync(dmDir, { recursive: true }); }

    for (const [channelId, msgs] of channelMap.entries()) {
      const channel = messages.find(m => m.channel_id === channelId)?.channel;
      const channelName = channel?.name || channelId;
      const guildName = channel?.guild_id ? guildMembers.find(g => g.guild.id === channel.guild_id)?.guild.name : undefined;

      channelIndex.push({
        channel_id: channelId,
        channel_name: channelName,
        guild_name: guildName,
        message_count: msgs.length,
      });

      const channelData = {
        channel_id: channelId,
        channel_name: channelName,
        guild_name: guildName,
        messages: msgs,
      };

      if (guildName) {
        fs.writeFileSync(
          path.join(guildChannelsDir, `${channelId}.json`),
          JSON.stringify(channelData, null, 2)
        );
      } else {
        // DM channel
        fs.writeFileSync(
          path.join(dmDir, `${channelId}.json`),
          JSON.stringify(channelData, null, 2)
        );
      }
    }

    fs.writeFileSync(path.join(messagesDir, 'index.json'), JSON.stringify(channelIndex, null, 2));

    // 6. Create reactions.json
    const reactionsData = reactions.map(r => ({
      message_id: r.message_id,
      channel_id: r.message.channel_id,
      emoji_name: r.emoji_name,
      emoji_id: r.emoji_id,
      created_at: r.created_at.toISOString(),
    }));
    fs.writeFileSync(path.join(exportBase, 'reactions.json'), JSON.stringify(reactionsData, null, 2));

    // 7. Create badges.json
    const badgesData = badges.map(b => ({
      badge_id: b.badge_id,
      name: b.badge.name,
      description: b.badge.description,
      assigned_at: b.assigned_at.toISOString(),
    }));
    fs.writeFileSync(path.join(exportBase, 'badges.json'), JSON.stringify(badgesData, null, 2));

    // 8. Create subscription.json
    const subscriptionData = subscription ? {
      tier_id: subscription.tier_id,
      status: subscription.status,
      current_period_start: subscription.current_period_start?.toISOString(),
      current_period_end: subscription.current_period_end?.toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      created_at: subscription.created_at?.toISOString(),
    } : null;
    fs.writeFileSync(path.join(exportBase, 'subscription.json'), JSON.stringify(subscriptionData, null, 2));

    // 9. Create moderation.json (audit logs where user is target)
    const moderationData = auditLogs.map(log => ({
      id: log.id,
      action_type: log.action_type,
      reason: log.reason,
      created_at: log.created_at.toISOString(),
      actor_id: log.user_id,
    }));
    fs.writeFileSync(path.join(exportBase, 'moderation.json'), JSON.stringify(moderationData, null, 2));

    // 10. Copy avatar and banner
    const filesDir = path.join(exportBase, 'files');
    if (!fs.existsSync(filesDir)) { fs.mkdirSync(filesDir, { recursive: true }); }

    const fullUser = await prisma.user.findUnique({ where: { id: userId } });
    if (fullUser?.avatar) {
      const avatarSrc = path.join(process.env.UPLOAD_DIR || './files', fullUser.avatar);
      if (fs.existsSync(avatarSrc)) {
        fs.copyFileSync(avatarSrc, path.join(filesDir, 'avatar.webp'));
      }
    }
    if (fullUser?.banner) {
      const bannerSrc = path.join(process.env.UPLOAD_DIR || './files', fullUser.banner);
      if (fs.existsSync(bannerSrc)) {
        fs.copyFileSync(bannerSrc, path.join(filesDir, 'banner.webp'));
      }
    }

    // 11. Include attachments if requested
    if (includeAttachments) {
      const attachmentsDir = path.join(filesDir, 'attachments');
      if (!fs.existsSync(attachmentsDir)) fs.mkdirSync(attachmentsDir, { recursive: true });

      const attachments = await prisma.attachment.findMany({
        where: { message: { author_id: userId } },
      });

      for (const att of attachments) {
        const src = path.join(process.env.UPLOAD_DIR || './files', att.storage_path);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(attachmentsDir, `${att.message_id}_${att.filename}`));
        }
      }
    }

    // 12. Create ZIP archive
    const zipPath = path.join(userDir, `${exportRecord.id}.zip`);
    await createZipArchive(exportBase, zipPath);

    // 13. Get final size
    const stats = fs.statSync(zipPath);
    const sizeBytes = stats.size;

    // 14. Update export record
    await prisma.dataExport.update({
      where: { id: exportRecord.id },
      data: {
        status: 'completed',
        size_bytes: sizeBytes,
        completed_at: new Date(),
      },
    });

    // 15. Emit Socket.IO event
    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit('DATA_EXPORT_COMPLETE', {
        export_id: exportRecord.id,
        download_url: `/api/users/@me/data-export/download`,
        size_bytes: sizeBytes,
      });
    }

    // 16. Send email notification if SMTP enabled
    if (fullUser?.email) {
      try {
        await sendEmail({
          to: fullUser.email,
          subject: 'Votre export de données OpenCord est prêt',
          template: 'email_verification', // Using existing template
          context: {
            username: fullUser.username,
            message: 'Votre export de données est prêt. Vous pouvez le télécharger depuis vos paramètres pendant 7 jours.',
          },
        });
      } catch (emailErr) {
        console.error('Failed to send export notification email:', emailErr);
      }
    }

    // Clean up temp directory
    fs.rmSync(exportBase, { recursive: true, force: true });

  } catch (err: any) {
    await prisma.dataExport.update({
      where: { id: exportRecord.id },
      data: { status: 'failed', error: err.message || 'Unknown error' },
    });

    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit('DATA_EXPORT_FAILED', {
        export_id: exportRecord.id,
        error: err.message || 'Unknown error',
      });
    }

    throw err;
  }
}

/**
 * Create a ZIP archive from a directory
 */
function createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

/**
 * Get the status of the user's latest export
 */
export async function getDataExportStatus(userId: string): Promise<any> {
  const exportRecord = await prisma.dataExport.findFirst({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
  });

  if (!exportRecord) return { status: 'none' };

  // Check if expired
  if (exportRecord.expires_at && exportRecord.expires_at < new Date()) {
    await prisma.dataExport.update({
      where: { id: exportRecord.id },
      data: { status: 'expired' },
    });
    return { status: 'expired', export_id: exportRecord.id };
  }

  const response: any = {
    export_id: exportRecord.id,
    status: exportRecord.status,
    created_at: exportRecord.created_at,
  };

  if (exportRecord.status === 'completed') {
    response.size_bytes = exportRecord.size_bytes;
    response.size_human = exportRecord.size_bytes ? `${Math.round(exportRecord.size_bytes / 1024 / 1024)} MB` : '0 MB';
    response.download_url = '/api/users/@me/data-export/download';
    response.expires_at = exportRecord.expires_at;
  }

  if (exportRecord.status === 'failed') {
    response.error = exportRecord.error;
  }

  return response;
}

/**
 * Download the completed export
 */
export async function downloadDataExport(userId: string): Promise<{ filePath: string; fileName: string }> {
  const exportRecord = await prisma.dataExport.findFirst({
    where: { user_id: userId, status: 'completed' },
    orderBy: { created_at: 'desc' },
  });

  if (!exportRecord) throw new AppError(404, 'NOT_FOUND', 'No completed export found');

  if (exportRecord.expires_at && exportRecord.expires_at < new Date()) {
    await prisma.dataExport.update({ where: { id: exportRecord.id }, data: { status: 'expired' } });
    throw new AppError(410, 'EXPORT_EXPIRED', 'Export has expired');
  }

  const exportPath = path.join(EXPORT_DIR, userId, `${exportRecord.id}.zip`);
  if (!fs.existsSync(exportPath)) throw new AppError(404, 'FILE_NOT_FOUND', 'Export file not found');

  return {
    filePath: exportPath,
    fileName: `opencord-export-${userId}-${new Date().toISOString().split('T')[0]}.zip`,
  };
}

/**
 * Schedule account deletion (14-day grace period)
 */
export async function scheduleDeleteAccount(userId: string, password: string, twoFactorCode?: string): Promise<{
  status: string;
  scheduled_deletion_at: Date;
  message: string;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

  const valid = await import('bcrypt').then(bc => bc.compare(password, user.password_hash));
  if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid password');

  if (user.two_factor_enabled) {
    if (!twoFactorCode) throw new AppError(400, 'MISSING_2FA_CODE', '2FA code required');
    const { authenticator } = await import('otplib');
    const isValid = authenticator.verify({ token: twoFactorCode, secret: user.two_factor_secret! });
    if (!isValid) throw new AppError(401, 'INVALID_2FA_CODE', 'Invalid 2FA code');
  }

  const deletionDate = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: { deletion_scheduled_at: deletionDate },
  });

  return {
    status: 'scheduled',
    scheduled_deletion_at: deletionDate,
    message: 'Votre compte sera supprimé dans 14 jours. Vous pouvez annuler en vous reconnectant.',
  };
}

/**
 * Cancel scheduled account deletion
 */
export async function cancelDeleteAccount(userId: string): Promise<{ status: string; message: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

  if (!user.deletion_scheduled_at) {
    throw new AppError(400, 'NO_DELETION_SCHEDULED', 'No account deletion scheduled');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { deletion_scheduled_at: null },
  });

  return { status: 'cancelled', message: 'La suppression de votre compte a été annulée.' };
}

/**
 * Execute definitive account deletion (called by cron after grace period)
 */
export async function executeAccountDeletion(userId: string, reason?: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

  const DELETED_USER_ID = 'deleted_user_system';

  // Ensure deleted user exists
  let deletedUser = await prisma.user.findUnique({ where: { id: DELETED_USER_ID } });
  if (!deletedUser) {
    deletedUser = await prisma.user.create({
      data: {
        id: DELETED_USER_ID,
        email: 'deleted@opencord.local',
        username: 'Deleted User',
        discriminator: '0000',
        password_hash: await import('bcrypt').then(bc => bc.hash(crypto.randomBytes(32).toString('hex'), 10)),
        date_of_birth: new Date('2000-01-01'),
      },
    });
  }

  // 1. Anonymize messages (replace author_id with deleted user)
  await prisma.message.updateMany({
    where: { author_id: userId },
    data: { author_id: DELETED_USER_ID },
  });

  // 2. Delete personal data
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: `deleted_${userId}@opencord.local`,
      username: `deleted_user_${userId.slice(-4)}`,
      discriminator: '0000',
      password_hash: '',
      avatar: null,
      avatar_hash: null,
      avatar_animated: false,
      banner: null,
      banner_hash: null,
      banner_animated: false,
      bio: null,
      global_name: null,
      pronouns: null,
      custom_status_text: null,
      custom_status_emoji: null,
      two_factor_enabled: false,
      two_factor_secret: null,
      two_factor_backup_codes: null,
      email_verify_token: null,
      password_reset_token: null,
      password_reset_expires: null,
      verified: false,
    },
  });

  // 3. Delete relationships (friends, blocked)
  await prisma.friend.deleteMany({
    where: { OR: [{ user_id: userId }, { target_id: userId }] },
  });

  // 4. Revoke all refresh tokens
  await prisma.refreshToken.updateMany({
    where: { user_id: userId },
    data: { is_revoked: true },
  });

  // 5. Delete notifications
  await prisma.notification.deleteMany({ where: { user_id: userId } });

  // 6. Remove badges
  await prisma.userBadge.deleteMany({ where: { user_id: userId } });

  // 7. Cancel subscription (via Stripe if active)
  const subscription = await prisma.userSubscription.findUnique({ where: { user_id: userId } });
  if (subscription?.stripe_subscription_id) {
    try {
      const stripe = await import('stripe').then(m => new m.default(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' }));
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
    } catch (err) {
      console.error('Failed to cancel Stripe subscription:', err);
    }
  }
  await prisma.userSubscription.deleteMany({ where: { user_id: userId } });

  // 8. Remove boosts
  await prisma.boost.updateMany({
    where: { user_id: userId, ended_at: null },
    data: { ended_at: new Date() },
  });

  // 9. Remove from DM channels (quit group DMs)
  const dmMemberships = await prisma.dMChannelMember.findMany({ where: { user_id: userId } });
  for (const membership of dmMemberships) {
    const dmChannel = await prisma.dMChannel.findUnique({ where: { id: membership.channel_id } });
    if (dmChannel?.type === 3) {
      // Group DM - remove user, transfer ownership if needed
      const remainingMembers = await prisma.dMChannelMember.findMany({
        where: { channel_id: membership.channel_id, user_id: { not: userId } },
      });
      if (remainingMembers.length > 0) {
        await prisma.dMChannel.update({
          where: { id: membership.channel_id },
          data: { owner_id: remainingMembers[0].user_id },
        });
      }
    }
    await prisma.dMChannelMember.delete({ where: { channel_id_user_id: { channel_id: membership.channel_id, user_id: userId } } });
  }

  // 10. Remove from guilds
  const memberships = await prisma.guildMember.findMany({ where: { user_id: userId } });
  for (const membership of memberships) {
    // Transfer ownership if user is owner
    const guild = await prisma.guild.findUnique({ where: { id: membership.guild_id } });
    if (guild?.owner_id === userId) {
      const nextMember = await prisma.guildMember.findFirst({
        where: { guild_id: membership.guild_id, user_id: { not: userId } },
        orderBy: { joined_at: 'asc' },
      });
      if (nextMember) {
        await prisma.guild.update({
          where: { id: membership.guild_id },
          data: { owner_id: nextMember.user_id },
        });
      } else {
        // Delete guild if no other members
        await prisma.guild.delete({ where: { id: membership.guild_id } });
      }
    }
    await prisma.guildMember.delete({
      where: {
        guild_id_user_id: {
          guild_id: membership.guild_id,
          user_id: userId,
        },
      },
    });
  }

  // 11. Delete avatar/banner files
  if (user.avatar) {
    const avatarPath = path.join(process.env.UPLOAD_DIR || './files', user.avatar);
    if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
  }
  if (user.banner) {
    const bannerPath = path.join(process.env.UPLOAD_DIR || './files', user.banner);
    if (fs.existsSync(bannerPath)) fs.unlinkSync(bannerPath);
  }

  // 12. Mark as deleted
  await prisma.user.update({
    where: { id: userId },
    data: { disabled: true, deletion_scheduled_at: null },
  });

  // 13. Send email notification
  if (user.email && !user.email.startsWith('deleted_')) {
    try {
      await sendEmail({
        to: user.email,
        template: 'account_disabled',
        subject: 'Your OpenCord account has been deleted',
        context: {
          username: user.username,
          reason: reason || 'Account deleted by user',
        },
      });
    } catch (err) {
      console.error('Failed to send account deletion email:', err);
    }
  }
}

/**
 * Cron job: Process scheduled deletions and expire old exports
 */
export async function runGdprCronJobs(): Promise<void> {
  // Process scheduled deletions (after 14 days)
  const dueDeletions = await prisma.user.findMany({
    where: {
      deletion_scheduled_at: { lte: new Date() },
    },
  });

  for (const user of dueDeletions) {
    try {
      await executeAccountDeletion(user.id, 'Scheduled deletion after grace period');
    } catch (err) {
      console.error(`Failed to delete account ${user.id}:`, err);
    }
  }

  // Expire old exports (older than 7 days)
  const expiredExports = await prisma.dataExport.findMany({
    where: {
      status: 'completed',
      expires_at: { lte: new Date() },
    },
  });

  for (const exp of expiredExports) {
    await prisma.dataExport.update({ where: { id: exp.id }, data: { status: 'expired' } });
    const exportPath = path.join(EXPORT_DIR, exp.user_id, `${exp.id}.zip`);
    if (fs.existsSync(exportPath)) fs.unlinkSync(exportPath);
  }
}
