import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const badges = [
    // OpenCord+ Premium badges (gradient + glow style)
    {
      id: '1',
      name: 'OPENCORD_CEO',
      label: 'CEO',
      icon: '',
      description: "Fondateur et PDG d'OpenCord",
      type: 'system',
      display_type: 'premium',
      color: '#FFD700',
      gradient_start: '#FFD700',
      gradient_end: '#FF8C00',
      glow: true,
      glow_color: '#FFD700',
      icon_position: 'left',
      priority: 1,
    },
    // Text-style badges (Discord-like colored labels)
    {
      id: '2',
      name: 'OPENCORD_STAFF',
      label: 'STAFF',
      icon: '',
      description: "Membre du staff OpenCord",
      type: 'system',
      display_type: 'text',
      color: '#5865F2',
      background_color: '#5865F2',
      text_color: '#ffffff',
      border_color: '#4752C4',
      priority: 2,
    },
    {
      id: '3',
      name: 'OPENCORD_DEVELOPER',
      label: 'DEVELOPER',
      icon: '',
      description: 'Développeur OpenCord',
      type: 'system',
      display_type: 'text',
      color: '#9B59B6',
      background_color: '#9B59B6',
      text_color: '#ffffff',
      border_color: '#8E44AD',
      priority: 3,
    },
    {
      id: '4',
      name: 'OPENCORD_BUG_HUNTER',
      label: 'BUG HUNTER',
      icon: '',
      description: 'Rapporteur de bugs validé',
      type: 'system',
      display_type: 'text',
      color: '#27AE60',
      background_color: '#27AE60',
      text_color: '#ffffff',
      border_color: '#1E8449',
      priority: 4,
    },
    {
      id: '5',
      name: 'OPENCORD_PARTNER',
      label: 'PARTNER',
      icon: '',
      description: 'Partenaire officiel OpenCord',
      type: 'system',
      display_type: 'text',
      color: '#7289DA',
      background_color: '#7289DA',
      text_color: '#ffffff',
      border_color: '#5B6DAE',
      priority: 5,
    },
    {
      id: '6',
      name: 'OPENCORD_HYPESQUAD',
      label: 'HYPESQUAD',
      icon: '',
      description: 'Membre HypeSquad',
      type: 'system',
      display_type: 'text',
      color: '#F0B132',
      background_color: '#F0B132',
      text_color: '#1a1a1a',
      border_color: '#D4A00A',
      priority: 6,
    },
    {
      id: '7',
      name: 'OPENCORD_EARLY_USER',
      label: 'EARLY USER',
      icon: '',
      description: 'Utilisateur depuis le lancement',
      type: 'system',
      display_type: 'text',
      color: '#95A5A6',
      background_color: '#95A5A6',
      text_color: '#ffffff',
      border_color: '#7F8C8D',
      priority: 100,
    },
    // OpenCord+ badge (premium subscription)
    {
      id: '8',
      name: 'OPENCORD_PLUS',
      label: 'OPENCORD+',
      icon: '',
      description: 'Abonné OpenCord+',
      type: 'premium',
      display_type: 'premium',
      color: '#F0B132',
      gradient_start: '#F0B132',
      gradient_end: '#FF8C00',
      glow: true,
      glow_color: '#F0B132',
      icon_position: 'left',
      priority: 10,
    },
    {
      id: '9',
      name: 'OPENCORD_BOOSTER',
      label: 'BOOSTER',
      icon: '',
      description: 'Booster de serveur OpenCord+',
      type: 'premium',
      display_type: 'premium',
      color: '#00D9FF',
      gradient_start: '#00D9FF',
      gradient_end: '#0078FF',
      glow: true,
      glow_color: '#00D9FF',
      icon_position: 'left',
      priority: 11,
    },
    // Icon badge for OpenCord+ subscriber (inline display)
    {
      id: '10',
      name: 'OPENCORD_PLUS_SUBSCRIBER',
      label: 'OpenCord+',
      icon: '',
      description: 'Abonné OpenCord+',
      type: 'auto',
      display_type: 'icon',
      color: '#F0B132',
      priority: 20,
    },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { id: badge.id },
      create: badge,
      update: badge,
    });
  }

  const platformDefaults = [
    { key: 'registration_enabled', value: 'true' },
    { key: 'invite_only', value: 'false' },
    { key: 'max_guilds_per_user', value: '100' },
    { key: 'default_locale', value: 'fr' },
    { key: 'maintenance_mode', value: 'false' },
    { key: 'platform_name', value: 'OpenCord' },
  ];

  for (const setting of platformDefaults) {
    await prisma.platformSettings.upsert({
      where: { key: setting.key },
      create: setting,
      update: {},
    });
  }

  const plugins = [
    {
      slug: 'always-animate',
      name: 'Always Animate',
      description: 'Anime tout ce qui peut être animé.',
      version: '1.0.0',
      type: 'CLIENT',
      author: 'Équipe OpenCord',
      icon: '✨',
      settings_schema: JSON.stringify({
        type: 'object',
        properties: {
          speed: { type: 'number', title: "Vitesse d'animation", default: 1, minimum: 0.1, maximum: 3 },
        },
      }),
    },
    {
      slug: 'better-notes-box',
      name: 'Better Notes Box',
      description: 'Améliore la zone de notes et son comportement.',
      version: '1.0.0',
      type: 'CLIENT',
      author: 'Équipe OpenCord',
      icon: '📝',
      settings_schema: JSON.stringify({
        type: 'object',
        properties: {
          hideNotes: { type: 'boolean', title: 'Masquer les notes', default: false },
          disableSpellCheck: { type: 'boolean', title: 'Désactiver le correcteur', default: false },
        },
      }),
    },
    {
      slug: 'message-logger',
      name: 'Message Logger',
      description: 'Journalise les messages édités et supprimés.',
      version: '1.0.0',
      type: 'BOTH',
      author: 'Équipe OpenCord',
      icon: '📋',
      settings_schema: JSON.stringify({
        type: 'object',
        properties: {
          logChannelId: { type: 'string', title: 'Canal de journalisation' },
        },
      }),
    },
    {
      slug: 'better-role-dot',
      name: 'Better Role Dot',
      description: "Permet d'exploiter plus facilement les couleurs de rôles.",
      version: '1.0.0',
      type: 'CLIENT',
      author: 'Équipe OpenCord',
      icon: '🎨',
      settings_schema: null,
    },
    {
      slug: 'quick-react',
      name: 'Quick React',
      description: 'Ajoute des réactions rapides sur les messages.',
      version: '1.0.0',
      type: 'CLIENT',
      author: 'Équipe OpenCord',
      icon: '⚡',
      settings_schema: JSON.stringify({
        type: 'object',
        properties: {
          count: { type: 'number', title: "Nombre d'émojis", default: 5, minimum: 1, maximum: 8 },
        },
      }),
    },
  ];

  for (const plugin of plugins) {
    await prisma.plugin.upsert({
      where: { slug: plugin.slug },
      create: {
        id: `plugin-${plugin.slug}`,
        enabled_by_default: false,
        ...plugin,
      },
      update: plugin,
    });
  }

  const adminExists = await prisma.user.findFirst({ where: { admin_level: 3 } });
  if (!adminExists) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);
    await prisma.user.create({
      data: {
        id: '100000000000000001',
        email: 'admin@opencord.local',
        username: 'Admin',
        discriminator: '0001',
        password_hash: passwordHash,
        date_of_birth: new Date('1990-01-01'),
        admin_level: 3,
        verified: true,
      },
    });
    console.log('Admin account created: admin@opencord.local / Admin123!');
  }

  const tiers = [
    { id: '1', name: 'OpenCord+', price_cents: 999, stripe_price_id: 'free', features: '["extended_upload","custom_tag","animated_avatar"]' },
    { id: '2', name: 'OpenCord+ Annual', price_cents: 9999, stripe_price_id: 'free_annual', features: '["extended_upload","custom_tag","animated_avatar"]' },
  ];

  for (const tier of tiers) {
    await prisma.subscriptionTier.upsert({
      where: { id: tier.id },
      create: tier,
      update: tier,
    });
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
