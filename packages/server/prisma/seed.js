import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const prisma = new PrismaClient();
async function main() {
    const badges = [
        { id: '1', name: 'Staff', icon: 'shield', description: 'OpenCord Staff' },
        { id: '2', name: 'Partner', icon: 'handshake', description: 'OpenCord Partner' },
        { id: '3', name: 'Bug Hunter', icon: 'bug', description: 'Found and reported bugs' },
        { id: '4', name: 'Early Supporter', icon: 'heart', description: 'Early OpenCord supporter' },
        { id: '5', name: 'Premium', icon: 'gem', description: 'OpenCord+ subscriber' },
        { id: '6', name: 'Verified Bot', icon: 'check-circle', description: 'Verified Bot' },
        { id: '7', name: 'Certified Moderator', icon: 'shield-check', description: 'Certified moderator' },
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
//# sourceMappingURL=seed.js.map