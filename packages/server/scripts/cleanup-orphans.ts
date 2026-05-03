#!/usr/bin/env node

/**
 * cleanup-orphans.ts
 * Script to identify and optionally delete orphaned files in the uploads directory.
 *
 * Usage:
 *   tsx scripts/cleanup-orphans.ts           # dry run (default)
 *   tsx scripts/cleanup-orphans.ts --confirm  # actually delete orphans
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/utils/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
const dryRun = !process.argv.includes('--confirm');

interface OrphanFile {
  path: string;
  size: number;
}

async function getAllFiles(dir: string, fileList: string[] = []): Promise<string[]> {
  if (!fs.existsSync(dir)) return fileList;

  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      await getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function getReferencedFiles(): Promise<Set<string>> {
  const referenced = new Set<string>();

  // Avatars
  const usersWithAvatars = await prisma.user.findMany({
    where: { avatar: { not: null } },
    select: { avatar: true },
  });
  for (const u of usersWithAvatars) {
    if (u.avatar) referenced.add(u.avatar);
  }

  // Banners
  const usersWithBanners = await prisma.user.findMany({
    where: { banner: { not: null } },
    select: { banner: true },
  });
  for (const u of usersWithBanners) {
    if (u.banner) referenced.add(u.banner);
  }

  // Guild icons
  const guildsWithIcons = await prisma.guild.findMany({
    where: { icon: { not: null } },
    select: { icon: true },
  });
  for (const g of guildsWithIcons) {
    if (g.icon) referenced.add(g.icon);
  }

  // Guild banners
  const guildsWithBanners = await prisma.guild.findMany({
    where: { banner: { not: null } },
    select: { banner: true },
  });
  for (const g of guildsWithBanners) {
    if (g.banner) referenced.add(g.banner);
  }

  // Attachments
  const attachments = await prisma.attachment.findMany({
    where: { deleted_at: null },
    select: { url: true, thumbnail_url: true },
  });
  for (const a of attachments) {
    referenced.add(a.url);
    if (a.thumbnail_url) referenced.add(a.thumbnail_url);
  }

  // Emojis
  const emojis = await prisma.emoji.findMany({
    where: { available: true },
    select: { asset: true },
  });
  for (const e of emojis) {
    referenced.add(e.asset);
  }

  // Stickers
  const stickers = await prisma.sticker.findMany({
    select: { asset: true },
  });
  for (const s of stickers) {
    referenced.add(s.asset);
  }

  return referenced;
}

function fileUrlToPath(url: string): string {
  // Convert /files/avatars/userId/hash_128.webp to uploads/avatars/userId/hash_128.webp
  if (url.startsWith('/files/')) {
    return path.join(uploadDir, url.replace('/files/', ''));
  }
  if (url.startsWith('/uploads/')) {
    return path.join(uploadDir, url.replace('/uploads/', ''));
  }
  return '';
}

async function main() {
  console.log('Cleanup Orphaned Files Script');
  console.log('============================');
  console.log(`Upload directory: ${uploadDir}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (use --confirm to actually delete)' : 'CONFIRMED - will delete orphans'}`);
  console.log('');

  if (!fs.existsSync(uploadDir)) {
    console.log('Upload directory does not exist. Nothing to do.');
    process.exit(0);
  }

  // Get all files on disk
  console.log('Scanning files on disk...');
  const allFiles = await getAllFiles(uploadDir);
  console.log(`Found ${allFiles.length} files on disk.`);

  // Get all referenced files from database
  console.log('Fetching referenced files from database...');
  const referenced = await getReferencedFiles();
  console.log(`Found ${referenced.size} referenced files in database.`);

  // Find orphans
  const orphans: OrphanFile[] = [];
  for (const filePath of allFiles) {
    // Convert absolute path to URL-like path
    const relativePath = '/' + path.relative(uploadDir, filePath).replace(/\\/g, '/');
    const fileUrl = '/files' + relativePath;

    if (!referenced.has(fileUrl)) {
      const stats = fs.statSync(filePath);
      orphans.push({ path: filePath, size: stats.size });
    }
  }

  console.log(`\nFound ${orphans.length} orphaned files.`);

  if (orphans.length === 0) {
    console.log('No orphans found. Exiting.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Calculate total size
  const totalSize = orphans.reduce((sum, f) => sum + f.size, 0);
  console.log(`Total recoverable space: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

  // Show some examples
  console.log('\nExample orphans:');
  orphans.slice(0, 10).forEach(f => {
    console.log(`  - ${path.relative(uploadDir, f.path)} (${(f.size / 1024).toFixed(2)} KB)`);
  });
  if (orphans.length > 10) {
    console.log(`  ... and ${orphans.length - 10} more`);
  }

  if (dryRun) {
    console.log('\nDRY RUN - No files deleted. Use --confirm to delete orphans.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Delete orphans
  console.log('\nDeleting orphans...');
  let deleted = 0;
  let failed = 0;
  for (const orphan of orphans) {
    try {
      fs.unlinkSync(orphan.path);
      deleted++;
    } catch (err) {
      console.error(`Failed to delete ${orphan.path}:`, err);
      failed++;
    }
  }

  console.log(`\nDeletion complete:`);
  console.log(`  - Deleted: ${deleted} files`);
  console.log(`  - Failed: ${failed} files`);
  console.log(`  - Space freed: ${(deleted * totalSize / orphans.length / 1024 / 1024).toFixed(2)} MB`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
