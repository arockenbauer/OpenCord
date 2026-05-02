/*
  Warnings:

  - You are about to drop the column `channel_id` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `guild_id` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `message_id` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `moderator_id` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `reported_user_id` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `resolution` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Report` table. All the data in the column will be lost.
  - Added the required column `target_id` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `target_type` to the `Report` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AdminAuditLog" ADD COLUMN "ip_address" TEXT;

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME,
    CONSTRAINT "Announcement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserGameLibrary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_url" TEXT,
    "last_played_at" DATETIME,
    "total_play_time_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserGameLibrary_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Badge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'system',
    "auto_rule" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "color" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Badge" ("auto_rule", "created_at", "description", "icon", "id", "name", "type") SELECT "auto_rule", "created_at", "description", "icon", "id", "name", "type" FROM "Badge";
DROP TABLE "Badge";
ALTER TABLE "new_Badge" RENAME TO "Badge";
CREATE TABLE "new_Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reporter_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewer_id" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME,
    CONSTRAINT "Report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("created_at", "id", "reason", "reporter_id", "resolved_at", "status") SELECT "created_at", "id", "reason", "reporter_id", "resolved_at", "status" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "discriminator" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "avatar" TEXT,
    "avatar_hash" TEXT,
    "avatar_animated" BOOLEAN NOT NULL DEFAULT false,
    "avatar_updated_at" DATETIME,
    "banner" TEXT,
    "banner_hash" TEXT,
    "banner_animated" BOOLEAN NOT NULL DEFAULT false,
    "banner_updated_at" DATETIME,
    "banner_color" TEXT,
    "bio" TEXT,
    "global_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'online',
    "custom_status_text" TEXT,
    "custom_status_emoji" TEXT,
    "custom_status_expires_at" DATETIME,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "explicit_content_filter" INTEGER NOT NULL DEFAULT 0,
    "default_message_notifications" INTEGER NOT NULL DEFAULT 0,
    "allow_dms_from" INTEGER NOT NULL DEFAULT 2,
    "admin_level" INTEGER NOT NULL DEFAULT 0,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret" TEXT,
    "two_factor_backup_codes" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verify_token" TEXT,
    "password_reset_token" TEXT,
    "password_reset_expires" DATETIME,
    "date_of_birth" DATETIME NOT NULL,
    "flags" INTEGER NOT NULL DEFAULT 0,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "premium_type" INTEGER NOT NULL DEFAULT 0,
    "premium_since" DATETIME,
    "premium_lost_at" DATETIME,
    "accent_color" TEXT,
    "bot" BOOLEAN NOT NULL DEFAULT false,
    "bot_token" TEXT,
    "bot_owner_id" TEXT,
    "application_id" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "ban_reason" TEXT,
    "banned_at" DATETIME,
    "banned_by" TEXT,
    "locked_until" DATETIME,
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "streamer_mode_enabled" BOOLEAN NOT NULL DEFAULT false,
    "streamer_mode_auto_detect" BOOLEAN NOT NULL DEFAULT true,
    "streamer_mode_hide_links" BOOLEAN NOT NULL DEFAULT true,
    "streamer_mode_hide_email" BOOLEAN NOT NULL DEFAULT true,
    "streamer_mode_hide_notes" BOOLEAN NOT NULL DEFAULT true,
    "streamer_mode_hide_notifications" BOOLEAN NOT NULL DEFAULT true,
    "streamer_mode_hide_personal_info" BOOLEAN NOT NULL DEFAULT true,
    "streamer_mode_disable_sounds" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_User" ("accent_color", "admin_level", "allow_dms_from", "application_id", "avatar", "avatar_animated", "avatar_hash", "avatar_updated_at", "ban_reason", "banned", "banner", "banner_animated", "banner_color", "banner_hash", "banner_updated_at", "bio", "bot", "bot_owner_id", "bot_token", "created_at", "custom_status_emoji", "custom_status_expires_at", "custom_status_text", "date_of_birth", "default_message_notifications", "disabled", "discriminator", "email", "email_verify_token", "explicit_content_filter", "flags", "global_name", "id", "last_seen_at", "locale", "locked_until", "login_attempts", "password_hash", "password_reset_expires", "password_reset_token", "premium", "premium_lost_at", "premium_since", "premium_type", "status", "theme", "two_factor_backup_codes", "two_factor_enabled", "two_factor_secret", "updated_at", "username", "verified") SELECT "accent_color", "admin_level", "allow_dms_from", "application_id", "avatar", "avatar_animated", "avatar_hash", "avatar_updated_at", "ban_reason", "banned", "banner", "banner_animated", "banner_color", "banner_hash", "banner_updated_at", "bio", "bot", "bot_owner_id", "bot_token", "created_at", "custom_status_emoji", "custom_status_expires_at", "custom_status_text", "date_of_birth", "default_message_notifications", "disabled", "discriminator", "email", "email_verify_token", "explicit_content_filter", "flags", "global_name", "id", "last_seen_at", "locale", "locked_until", "login_attempts", "password_hash", "password_reset_expires", "password_reset_token", "premium", "premium_lost_at", "premium_since", "premium_type", "status", "theme", "two_factor_backup_codes", "two_factor_enabled", "two_factor_secret", "updated_at", "username", "verified" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_discriminator_key" ON "User"("username", "discriminator");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "UserGameLibrary_user_id_name_key" ON "UserGameLibrary"("user_id", "name");
