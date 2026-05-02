import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { sendPremiumConfirmEmail } from '../utils/email.js';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' as any })
  : null;

function parseTierFeatures(features: string | string[] | null | undefined): string[] {
  if (Array.isArray(features)) return features.map((feature) => String(feature));
  if (typeof features !== 'string' || !features.trim()) return [];

  try {
    const parsed = JSON.parse(features);
    return Array.isArray(parsed) ? parsed.map((feature) => String(feature)) : [];
  } catch {
    return [];
  }
}

function formatTierResponse(tier: {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  features: string | string[];
}): {
  id: string;
  name: string;
  price_cents: number;
  price_monthly: number;
  currency: string;
  description: string;
  features: string[];
} {
  return {
    id: tier.id,
    name: tier.name,
    price_cents: tier.price_cents,
    price_monthly: Number((tier.price_cents / 100).toFixed(2)),
    currency: tier.currency,
    description: tier.name.toLowerCase().includes('annual')
      ? 'Paiement annuel pour OpenCord+.'
      : 'Debloquez les avantages premium OpenCord+.',
    features: parseTierFeatures(tier.features),
  };
}

// ── Stripe Checkout Session ────────────────────────────────────────────────

export async function createCheckoutSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!stripe) throw new AppError(503, 'STRIPE_NOT_CONFIGURED', 'Stripe is not configured on this server');

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const existing = await prisma.userSubscription.findFirst({
      where: { user_id: req.user!.userId, status: 'active' },
    });
    if (existing) throw new AppError(400, 'ALREADY_SUBSCRIBED', 'Already subscribed');

    let customerId = user.stripe_customer_id || undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.username,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripe_customer_id: customerId } });
    }

    const tier = await prisma.subscriptionTier.findFirst({ where: { active: true }, orderBy: { price_cents: 'asc' } });
    if (!tier || !tier.stripe_price_id || tier.stripe_price_id === 'price_free_tier') {
      throw new AppError(400, 'NO_PRICE_CONFIGURED', 'No Stripe price configured');
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: tier.stripe_price_id, quantity: 1 }],
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/premium/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/premium`,
      metadata: { userId: user.id, tierId: tier.id },
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
}

export async function createPortalSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!stripe) throw new AppError(503, 'STRIPE_NOT_CONFIGURED', 'Stripe is not configured');

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user?.stripe_customer_id) throw new AppError(400, 'NO_CUSTOMER', 'No Stripe customer found');

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/premium`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
}

export async function cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!stripe) {
      // Fallback: local cancellation when Stripe is not configured
      await doLocalCancel(req.user!.userId);
      res.status(204).send();
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user?.stripe_customer_id) throw new AppError(400, 'NO_CUSTOMER', 'No Stripe customer found');

    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripe_customer_id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length > 0) {
      await stripe.subscriptions.cancel(subscriptions.data[0].id);
    }

    await doLocalCancel(req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function doLocalCancel(userId: string) {
  const sub = await prisma.userSubscription.findFirst({ where: { user_id: userId, status: 'active' } });
  if (sub) {
    await prisma.userSubscription.update({ where: { id: sub.id }, data: { status: 'canceled', canceled_at: new Date() } });
  }
  await prisma.user.update({ where: { id: userId }, data: { premium: false, premium_type: 0, premium_lost_at: new Date() } });

  const io = getIO();
  if (io) io.to(`user:${userId}`).emit(GatewayEvents.USER_UPDATE, { id: userId, premium: false, premium_type: 0 });
}

// ── Stripe Webhook ──────────────────────────────────────────────────────────

export async function handleStripeWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!stripe) { res.status(204).send(); return; }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) { res.status(204).send(); return; }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    throw new AppError(400, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Stripe webhook signature');
  }

  // Idempotency check
  const existing = await prisma.stripeEvent.findUnique({ where: { event_id: event.id } });
  if (existing) { res.status(200).json({ received: true }); return; }

  await prisma.stripeEvent.create({
      data: {
        id: generateSnowflake(),
        event_id: event.id,
        type: event.type as string,
      } as Parameters<typeof prisma.stripeEvent.create>[0]['data'],
    });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;
        const userId = session.metadata?.userId;
        const tierId = session.metadata?.tierId;
        if (!userId) break;

        const customer = await stripe!.customers.retrieve(session.customer as string) as Stripe.Customer;
        const subscription = await stripe!.subscriptions.retrieve(session.subscription as string);

        await prisma.user.update({
          where: { id: userId },
          data: {
            premium: true,
            premium_type: 2,
            premium_since: new Date(),
            stripe_customer_id: session.customer as string,
          },
        });

        await prisma.userSubscription.upsert({
          where: { stripe_subscription_id: subscription.id },
          create: {
            id: generateSnowflake(),
            user_id: userId,
            tier_id: tierId || 'opencord-plus',
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscription.id,
            status: 'active',
            current_period_start: new Date(subscription.current_period_start * 1000),
            current_period_end: new Date(subscription.current_period_end * 1000),
            cancel_at_period_end: subscription.cancel_at_period_end,
          },
          update: {
            status: 'active',
            current_period_start: new Date(subscription.current_period_start * 1000),
            current_period_end: new Date(subscription.current_period_end * 1000),
            cancel_at_period_end: subscription.cancel_at_period_end,
          },
        });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) sendPremiumConfirmEmail(user.email, user.username, 'OpenCord+').catch(() => {});

        const io = getIO();
        if (io) io.to(`user:${userId}`).emit(GatewayEvents.USER_UPDATE, { id: userId, premium: true, premium_type: 2 });
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const existingSub = await prisma.userSubscription.findUnique({ where: { stripe_subscription_id: sub.id } });
        if (existingSub) {
          const newStatus = sub.status === 'active' ? 'active' : sub.status === 'canceled' ? 'canceled' : sub.status;
          await prisma.userSubscription.update({
            where: { stripe_subscription_id: sub.id },
            data: {
              status: newStatus,
              current_period_start: new Date(sub.current_period_start * 1000),
              current_period_end: new Date(sub.current_period_end * 1000),
              cancel_at_period_end: sub.cancel_at_period_end,
            },
          });
          if (sub.status !== 'active') {
            await prisma.user.update({ where: { id: existingSub.user_id }, data: { premium: false, premium_type: 0, premium_lost_at: new Date() } });
            const io = getIO();
            if (io) io.to(`user:${existingSub.user_id}`).emit(GatewayEvents.USER_UPDATE, { id: existingSub.user_id, premium: false, premium_type: 0 });
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const existingSub = await prisma.userSubscription.findUnique({ where: { stripe_subscription_id: sub.id } });
        if (existingSub) {
          await prisma.userSubscription.update({ where: { stripe_subscription_id: sub.id }, data: { status: 'canceled', canceled_at: new Date() } });
          await prisma.user.update({ where: { id: existingSub.user_id }, data: { premium: false, premium_type: 0, premium_lost_at: new Date() } });
          const io = getIO();
          if (io) io.to(`user:${existingSub.user_id}`).emit(GatewayEvents.USER_UPDATE, { id: existingSub.user_id, premium: false, premium_type: 0 });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          const user = await prisma.user.findFirst({ where: { stripe_customer_id: customerId } });
          if (user) {
            const io = getIO();
            if (io) io.to(`user:${user.id}`).emit(GatewayEvents.USER_UPDATE, { id: user.id, premium: false, premium_type: 0, payment_failed: true });
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error('Stripe webhook processing error:', err);
  }

  await prisma.stripeEvent.update({ where: { event_id: event.id }, data: { processed: true } });
  res.status(200).json({ received: true });
}

export async function getPremiumTiers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tiers = await prisma.subscriptionTier.findMany({ where: { active: true }, orderBy: { price_cents: 'asc' } });

    if (tiers.length === 0) {
      res.json({
        tiers: [
          formatTierResponse({
            id: '1',
            name: 'OpenCord+',
            price_cents: 499,
            currency: 'EUR',
            features: [
              'Animated avatar',
              'Custom profile banner',
              'Animated server banner (for boosted servers)',
              'Extended bio (4000 characters)',
              '25MB file uploads',
              '2 server boosts included',
              'Use custom emojis anywhere',
              'Custom tag color',
            ],
          }),
        ],
      });
      return;
    }

    res.json({ tiers: tiers.map((tier) => formatTierResponse(tier)) });
  } catch (err) {
    next(err);
  }
}

export async function getMySubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const subscription = await prisma.userSubscription.findFirst({
      where: { user_id: req.user!.userId, status: 'active' },
      include: { tier: true },
    });

    res.json({ subscription: subscription || null });
  } catch (err) {
    next(err);
  }
}

export async function subscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const existing = await prisma.userSubscription.findFirst({
      where: { user_id: req.user!.userId, status: 'active' },
    });
    if (existing) throw new AppError(400, 'ALREADY_SUBSCRIBED', 'You already have an active subscription');

    let tier = await prisma.subscriptionTier.findFirst({ where: { active: true }, orderBy: { price_cents: 'asc' } });
    if (!tier) {
      tier = await prisma.subscriptionTier.create({
        data: {
          id: generateSnowflake(),
          name: 'OpenCord+',
          price_cents: 499,
          currency: 'EUR',
          stripe_price_id: 'price_free_tier',
          features: JSON.stringify(['animated_avatar', 'custom_banner', 'extended_bio', '25mb_upload', 'external_emojis', 'server_boosts']),
        },
      });
    }

    const sub = await prisma.userSubscription.create({
      data: {
        id: generateSnowflake(),
        user_id: req.user!.userId,
        tier_id: tier.id,
        status: 'active',
        stripe_customer_id: `cus_local_${req.user!.userId}`,
        stripe_subscription_id: `sub_local_${generateSnowflake()}`,
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      include: { tier: true },
    });

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { premium: true, premium_type: 2, premium_since: new Date() },
    });

    const io = getIO();
    if (io) {
      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.USER_UPDATE, {
        id: req.user!.userId,
        premium: true,
        premium_type: 2,
      });
    }

    sendPremiumConfirmEmail(user.email, user.username, tier.name).catch(() => {});

    res.status(201).json({ subscription: sub });
  } catch (err) {
    next(err);
  }
}

export async function getMyBoosts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const boosts = await prisma.boost.findMany({
      where: { user_id: req.user!.userId, ended_at: null },
      include: { guild: { select: { id: true, name: true, icon: true } } },
    });
    res.json({ boosts });
  } catch (err) {
    next(err);
  }
}

export async function boostGuild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    if (!user.premium) throw new AppError(403, 'NOT_PREMIUM', 'You need OpenCord+ to boost servers');

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const member = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.user!.userId } },
    });
    if (!member) throw new AppError(403, 'NOT_MEMBER', 'You are not a member of this server');

    const existingBoosts = await prisma.boost.count({
      where: { guild_id: req.params.guildId, user_id: req.user!.userId, ended_at: null },
    });
    if (existingBoosts >= 2) throw new AppError(400, 'BOOST_LIMIT', 'You can boost a server up to 2 times');

    const prevTier = guild.premium_tier;
    const prevCount = guild.premium_subscription_count;

    const boost = await prisma.boost.create({
      data: { id: generateSnowflake(), guild_id: req.params.guildId, user_id: req.user!.userId },
    });

    const totalBoosts = await prisma.boost.count({ where: { guild_id: req.params.guildId, ended_at: null } });
    const premiumTier = totalBoosts >= 14 ? 3 : totalBoosts >= 7 ? 2 : totalBoosts >= 2 ? 1 : 0;

    const updatedGuild = await prisma.guild.update({
      where: { id: req.params.guildId },
      data: { premium_tier: premiumTier, premium_subscription_count: totalBoosts },
    });

    if (guild.system_channel_id) {
      const boostMsg = await prisma.message.create({
        data: {
          id: generateSnowflake(),
          channel_id: guild.system_channel_id,
          author_id: '0',
          content: `🚀 **${user.username}** vient de booster le serveur ! Le serveur a maintenant **${totalBoosts}** boosts.`,
          type: 18,
        },
      });
      const io = getIO();
      if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.MESSAGE_CREATE, { message: { ...boostMsg, guild_id: guild.id } });

      if (premiumTier > prevTier) {
        const tierNames: Record<number, string> = { 1: 'Niveau 1', 2: 'Niveau 2', 3: 'Niveau 3' };
        const tierMsg = await prisma.message.create({
          data: {
            id: generateSnowflake(),
            channel_id: guild.system_channel_id,
            author_id: '0',
            content: `🎉 **${guild.name}** a atteint le **${tierNames[premiumTier]}** !`,
            type: 18,
          },
        });
        if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.MESSAGE_CREATE, { message: { ...tierMsg, guild_id: guild.id } });
      }
    }

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_UPDATE, { guild: updatedGuild });
    }

    res.status(201).json({
      boost,
      guild: { premium_tier: premiumTier, premium_subscription_count: totalBoosts },
    });
  } catch (err) {
    next(err);
  }
}

export async function unboostGuild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const boosts = await prisma.boost.findMany({
      where: { guild_id: req.params.guildId, user_id: req.user!.userId, ended_at: null },
      orderBy: { started_at: 'desc' },
    });

    if (boosts.length === 0) throw new AppError(404, 'NOT_FOUND', 'No active boost found');

    await prisma.boost.update({ where: { id: boosts[0].id }, data: { ended_at: new Date() } });

    const totalBoosts = await prisma.boost.count({ where: { guild_id: req.params.guildId, ended_at: null } });
    const premiumTier = totalBoosts >= 14 ? 3 : totalBoosts >= 7 ? 2 : totalBoosts >= 2 ? 1 : 0;

    const updatedGuild = await prisma.guild.update({
      where: { id: req.params.guildId },
      data: { premium_tier: premiumTier, premium_subscription_count: totalBoosts },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_UPDATE, { guild: updatedGuild });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeBoost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const boost = await prisma.boost.findFirst({
      where: { id: req.params.boostId, guild_id: req.params.guildId, user_id: req.user!.userId, ended_at: null },
    });
    if (!boost) throw new AppError(404, 'NOT_FOUND', 'Boost not found');

    await prisma.boost.update({ where: { id: boost.id }, data: { ended_at: new Date() } });

    const totalBoosts = await prisma.boost.count({ where: { guild_id: req.params.guildId, ended_at: null } });
    const premiumTier = totalBoosts >= 14 ? 3 : totalBoosts >= 7 ? 2 : totalBoosts >= 2 ? 1 : 0;

    const updatedGuild = await prisma.guild.update({
      where: { id: req.params.guildId },
      data: { premium_tier: premiumTier, premium_subscription_count: totalBoosts },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_UPDATE, { guild: updatedGuild });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
