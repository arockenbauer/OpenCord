-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "channel_id" TEXT;
ALTER TABLE "Notification" ADD COLUMN "guild_id" TEXT;
ALTER TABLE "Notification" ADD COLUMN "message_id" TEXT;

-- CreateTable
CREATE TABLE "GuildWelcomeChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "emoji_id" TEXT,
    "description" TEXT NOT NULL,
    CONSTRAINT "GuildWelcomeChannel_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildWelcomeChannel_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildAnalyticsSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "member_joins" INTEGER NOT NULL DEFAULT 0,
    "member_leaves" INTEGER NOT NULL DEFAULT 0,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "active_members" INTEGER NOT NULL DEFAULT 0,
    "active_communicators" INTEGER NOT NULL DEFAULT 0,
    "voice_minutes" INTEGER NOT NULL DEFAULT 0,
    "top_channels" TEXT NOT NULL DEFAULT '[]',
    "hourly_messages" TEXT NOT NULL DEFAULT '[]',
    "join_sources" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildAnalyticsSnapshot_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "display_type" TEXT NOT NULL DEFAULT 'icon',
    "background_color" TEXT DEFAULT '#5865F2',
    "text_color" TEXT DEFAULT '#ffffff',
    "border_color" TEXT DEFAULT '#5865F2',
    "gradient_start" TEXT DEFAULT '#FF73FA',
    "gradient_end" TEXT DEFAULT '#7367F0',
    "glow" BOOLEAN NOT NULL DEFAULT false,
    "glow_color" TEXT DEFAULT '#FF73FA',
    "icon_position" TEXT NOT NULL DEFAULT 'left',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Badge" ("auto_rule", "color", "created_at", "description", "icon", "id", "label", "name", "priority", "type") SELECT "auto_rule", "color", "created_at", "description", "icon", "id", "label", "name", "priority", "type" FROM "Badge";
DROP TABLE "Badge";
ALTER TABLE "new_Badge" RENAME TO "Badge";
CREATE TABLE "new_Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "icon_hash" TEXT,
    "banner" TEXT,
    "banner_hash" TEXT,
    "splash" TEXT,
    "description" TEXT,
    "owner_id" TEXT NOT NULL,
    "verification_level" INTEGER NOT NULL DEFAULT 0,
    "default_message_notifications" INTEGER NOT NULL DEFAULT 0,
    "explicit_content_filter" INTEGER NOT NULL DEFAULT 0,
    "system_channel_id" TEXT,
    "system_channel_flags" INTEGER NOT NULL DEFAULT 0,
    "welcome_enabled" BOOLEAN NOT NULL DEFAULT false,
    "afk_channel_id" TEXT,
    "afk_timeout" INTEGER NOT NULL DEFAULT 300,
    "preferred_locale" TEXT NOT NULL DEFAULT 'fr',
    "features" TEXT NOT NULL DEFAULT '[]',
    "vanity_url_code" TEXT,
    "premium_tier" INTEGER NOT NULL DEFAULT 0,
    "premium_subscription_count" INTEGER NOT NULL DEFAULT 0,
    "max_members" INTEGER NOT NULL DEFAULT 500000,
    "invites_disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Guild_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Guild" ("afk_channel_id", "afk_timeout", "banner", "banner_hash", "created_at", "default_message_notifications", "description", "explicit_content_filter", "features", "icon", "icon_hash", "id", "invites_disabled", "max_members", "name", "owner_id", "preferred_locale", "premium_subscription_count", "premium_tier", "splash", "system_channel_flags", "system_channel_id", "updated_at", "vanity_url_code", "verification_level") SELECT "afk_channel_id", "afk_timeout", "banner", "banner_hash", "created_at", "default_message_notifications", "description", "explicit_content_filter", "features", "icon", "icon_hash", "id", "invites_disabled", "max_members", "name", "owner_id", "preferred_locale", "premium_subscription_count", "premium_tier", "splash", "system_channel_flags", "system_channel_id", "updated_at", "vanity_url_code", "verification_level" FROM "Guild";
DROP TABLE "Guild";
ALTER TABLE "new_Guild" RENAME TO "Guild";
CREATE UNIQUE INDEX "Guild_vanity_url_code_key" ON "Guild"("vanity_url_code");
CREATE TABLE "new_Invite" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "max_uses" INTEGER NOT NULL DEFAULT 0,
    "max_age" INTEGER NOT NULL DEFAULT 86400,
    "temporary" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'invite',
    "source_guild_id" TEXT,
    CONSTRAINT "Invite_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invite_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invite_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invite" ("channel_id", "code", "created_at", "expires_at", "guild_id", "inviter_id", "max_age", "max_uses", "temporary", "uses") SELECT "channel_id", "code", "created_at", "expires_at", "guild_id", "inviter_id", "max_age", "max_uses", "temporary", "uses" FROM "Invite";
DROP TABLE "Invite";
ALTER TABLE "new_Invite" RENAME TO "Invite";
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT,
    "type" INTEGER NOT NULL DEFAULT 0,
    "flags" INTEGER NOT NULL DEFAULT 0,
    "edited_at" DATETIME,
    "tts" BOOLEAN NOT NULL DEFAULT false,
    "mention_everyone" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "reference_id" TEXT,
    "thread_id" TEXT,
    "webhook_id" TEXT,
    "application_id" TEXT,
    "sticker_ids" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guildMemberGuild_id" TEXT,
    "guildMemberUser_id" TEXT,
    CONSTRAINT "Message_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_guildMemberGuild_id_guildMemberUser_id_fkey" FOREIGN KEY ("guildMemberGuild_id", "guildMemberUser_id") REFERENCES "GuildMember" ("guild_id", "user_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("application_id", "author_id", "channel_id", "content", "created_at", "edited_at", "flags", "id", "mention_everyone", "pinned", "reference_id", "sticker_ids", "thread_id", "tts", "type", "webhook_id") SELECT "application_id", "author_id", "channel_id", "content", "created_at", "edited_at", "flags", "id", "mention_everyone", "pinned", "reference_id", "sticker_ids", "thread_id", "tts", "type", "webhook_id" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
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
    "pronouns" TEXT,
    "global_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'online',
    "custom_status_text" TEXT,
    "custom_status_emoji" TEXT,
    "custom_status_expires_at" DATETIME,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "font_size" INTEGER NOT NULL DEFAULT 14,
    "explicit_content_filter" INTEGER NOT NULL DEFAULT 0,
    "default_message_notifications" INTEGER NOT NULL DEFAULT 0,
    "allow_dms_from" INTEGER NOT NULL DEFAULT 2,
    "allow_friend_requests_from" TEXT NOT NULL DEFAULT 'everyone',
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
    "stripe_customer_id" TEXT,
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
INSERT INTO "new_User" ("accent_color", "admin_level", "allow_dms_from", "allow_friend_requests_from", "application_id", "avatar", "avatar_animated", "avatar_hash", "avatar_updated_at", "ban_reason", "banned", "banned_at", "banned_by", "banner", "banner_animated", "banner_color", "banner_hash", "banner_updated_at", "bio", "bot", "bot_owner_id", "bot_token", "created_at", "custom_status_emoji", "custom_status_expires_at", "custom_status_text", "date_of_birth", "default_message_notifications", "disabled", "discriminator", "email", "email_verify_token", "explicit_content_filter", "flags", "global_name", "id", "last_seen_at", "locale", "locked_until", "login_attempts", "password_hash", "password_reset_expires", "password_reset_token", "premium", "premium_lost_at", "premium_since", "premium_type", "status", "streamer_mode_auto_detect", "streamer_mode_disable_sounds", "streamer_mode_enabled", "streamer_mode_hide_email", "streamer_mode_hide_links", "streamer_mode_hide_notes", "streamer_mode_hide_notifications", "streamer_mode_hide_personal_info", "theme", "two_factor_backup_codes", "two_factor_enabled", "two_factor_secret", "updated_at", "username", "verified") SELECT "accent_color", "admin_level", "allow_dms_from", "allow_friend_requests_from", "application_id", "avatar", "avatar_animated", "avatar_hash", "avatar_updated_at", "ban_reason", "banned", "banned_at", "banned_by", "banner", "banner_animated", "banner_color", "banner_hash", "banner_updated_at", "bio", "bot", "bot_owner_id", "bot_token", "created_at", "custom_status_emoji", "custom_status_expires_at", "custom_status_text", "date_of_birth", "default_message_notifications", "disabled", "discriminator", "email", "email_verify_token", "explicit_content_filter", "flags", "global_name", "id", "last_seen_at", "locale", "locked_until", "login_attempts", "password_hash", "password_reset_expires", "password_reset_token", "premium", "premium_lost_at", "premium_since", "premium_type", "status", "streamer_mode_auto_detect", "streamer_mode_disable_sounds", "streamer_mode_enabled", "streamer_mode_hide_email", "streamer_mode_hide_links", "streamer_mode_hide_notes", "streamer_mode_hide_notifications", "streamer_mode_hide_personal_info", "theme", "two_factor_backup_codes", "two_factor_enabled", "two_factor_secret", "updated_at", "username", "verified" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_discriminator_key" ON "User"("username", "discriminator");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GuildWelcomeChannel_guild_id_channel_id_key" ON "GuildWelcomeChannel"("guild_id", "channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "GuildAnalyticsSnapshot_guild_id_date_key" ON "GuildAnalyticsSnapshot"("guild_id", "date");
