-- CreateTable
CREATE TABLE "User" (
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
    "allow_dms_from" TEXT NOT NULL DEFAULT 'everyone',
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
    "deletion_scheduled_at" DATETIME,
    "show_mutual_guilds" BOOLEAN NOT NULL DEFAULT true,
    "show_mutual_friends" BOOLEAN NOT NULL DEFAULT true,
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

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_info" TEXT,
    "ip_address" TEXT,
    "last_used_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Guild" (
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
    "discoverable" BOOLEAN NOT NULL DEFAULT false,
    "discovery_splash" TEXT,
    "discovery_description" TEXT,
    "primary_category_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Guild_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Guild_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "DiscoveryCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildMember" (
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nickname" TEXT,
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "premium_since" DATETIME,
    "deaf" BOOLEAN NOT NULL DEFAULT false,
    "mute" BOOLEAN NOT NULL DEFAULT false,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "communication_disabled_until" DATETIME,

    PRIMARY KEY ("guild_id", "user_id"),
    CONSTRAINT "GuildMember_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT,
    "name" TEXT NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "topic" TEXT,
    "nsfw" BOOLEAN NOT NULL DEFAULT false,
    "parent_id" TEXT,
    "last_message_id" TEXT,
    "slowmode_delay" INTEGER NOT NULL DEFAULT 0,
    "bitrate" INTEGER NOT NULL DEFAULT 64000,
    "user_limit" INTEGER NOT NULL DEFAULT 0,
    "default_auto_archive_duration" INTEGER,
    "thread_metadata" TEXT,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "available_tags" TEXT,
    "default_reaction_emoji" TEXT,
    "default_thread_rate_limit_per_user" INTEGER,
    "default_sort_order" INTEGER,
    "default_forum_layout" INTEGER DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Channel_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Channel_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Channel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
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

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "thumbnail_url" TEXT,
    "spoiler" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME,
    CONSTRAINT "Attachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Embed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    CONSTRAINT "Embed_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 86400,
    "allow_multiselect" BOOLEAN NOT NULL DEFAULT false,
    "ended_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Poll_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PollAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poll_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "answer_ids" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollAnswer_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "Poll" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji_name" TEXT NOT NULL,
    "emoji_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reaction_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "pinned_by" TEXT NOT NULL,
    "pinned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pin_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReadState" (
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "last_read_message_id" TEXT,
    "mention_count" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("user_id", "channel_id"),
    CONSTRAINT "ReadState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReadState_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "hoist" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "permissions" BIGINT NOT NULL DEFAULT 0,
    "mentionable" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT,
    "unicode_emoji" TEXT,
    "managed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildMemberRole" (
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT,

    PRIMARY KEY ("guild_id", "user_id", "role_id"),
    CONSTRAINT "GuildMemberRole_guild_id_user_id_fkey" FOREIGN KEY ("guild_id", "user_id") REFERENCES "GuildMember" ("guild_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildMemberRole_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildMemberRole_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PermissionOverwrite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "allow" BIGINT NOT NULL DEFAULT 0,
    "deny" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "PermissionOverwrite_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PermissionOverwrite_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invite" (
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

-- CreateTable
CREATE TABLE "Ban" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "banned_by" TEXT NOT NULL,
    "delete_message_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ban_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ban_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ban_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Emoji" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creator_id" TEXT,
    "animated" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "require_colons" BOOLEAN NOT NULL DEFAULT true,
    "managed" BOOLEAN NOT NULL DEFAULT false,
    "asset" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Emoji_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Emoji_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT,
    "format_type" INTEGER NOT NULL DEFAULT 1,
    "asset" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sort_value" INTEGER NOT NULL DEFAULT 0,
    "creator_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sticker_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Sticker_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "token" TEXT NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 1,
    "source_guild_id" TEXT,
    "source_channel_id" TEXT,
    "creator_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Webhook_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Webhook_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Webhook_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action_type" INTEGER NOT NULL,
    "target_id" TEXT,
    "target_type" TEXT,
    "changes" TEXT,
    "reason" TEXT,
    "options" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "guild_id" TEXT,
    "channel_id" TEXT,
    "message_id" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Badge" (
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

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "assigned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT,
    CONSTRAINT "UserBadge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserBadge_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "Badge" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubscriptionTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "stripe_price_id" TEXT NOT NULL,
    "features" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_period_start" DATETIME NOT NULL,
    "current_period_end" DATETIME NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "UserSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSubscription_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "SubscriptionTier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Boost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    CONSTRAINT "Boost_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Boost_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutoModRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "event_type" INTEGER NOT NULL DEFAULT 1,
    "trigger_type" INTEGER NOT NULL,
    "trigger_metadata" TEXT NOT NULL DEFAULT '{}',
    "actions" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "exempt_roles" TEXT NOT NULL DEFAULT '[]',
    "exempt_channels" TEXT NOT NULL DEFAULT '[]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "AutoModRule_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutoModExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rule_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "content" TEXT,
    "matched_content" TEXT,
    "matched_keyword" TEXT,
    "action" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoModExecution_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "AutoModRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutoModExecution_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutoModExecution_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
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

-- CreateTable
CREATE TABLE "DMChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT,
    "icon" TEXT,
    "owner_id" TEXT,
    "last_message_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DMChannelMember" (
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_message_id" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("channel_id", "user_id"),
    CONSTRAINT "DMChannelMember_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "DMChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DMChannelMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Friend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Friend_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Friend_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Plugin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "icon" TEXT,
    "enabled_by_default" BOOLEAN NOT NULL DEFAULT false,
    "settings_schema" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserPluginSettings" (
    "user_id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" TEXT,

    PRIMARY KEY ("user_id", "plugin_id"),
    CONSTRAINT "UserPluginSettings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPluginSettings_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "Plugin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildPluginSettings" (
    "guild_id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" TEXT,

    PRIMARY KEY ("guild_id", "plugin_id"),
    CONSTRAINT "GuildPluginSettings_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildPluginSettings_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "Plugin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_by" TEXT,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "details" TEXT,
    "ip_address" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT,
    "channel_id" TEXT,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "suppress_everyone" BOOLEAN NOT NULL DEFAULT false,
    "suppress_roles" BOOLEAN NOT NULL DEFAULT false,
    "message_notifications" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "NotificationSettings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationSettings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "owner_id" TEXT NOT NULL,
    "bot_id" TEXT,
    "client_secret" TEXT,
    "redirect_uris" TEXT,
    "scopes_allowed" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Application_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApplicationCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "guild_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "options" TEXT,
    "default_member_permissions" TEXT,
    "dm_permission" BOOLEAN NOT NULL DEFAULT true,
    "type" INTEGER NOT NULL DEFAULT 1,
    "nsfw" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT,
    "handler" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ApplicationCommand_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApplicationCommand_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApplicationCommandPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "command_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "guild_id" TEXT,
    "role_id" TEXT,
    "user_id" TEXT,
    "permission_type" INTEGER NOT NULL DEFAULT 1,
    "allow" TEXT NOT NULL DEFAULT '0',
    "deny" TEXT NOT NULL DEFAULT '0',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationCommandPermission_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "ApplicationCommand" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApplicationCommandPermission_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApplicationCommandPermission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApplicationCommandPermission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuth2AuthorizationCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "app_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuth2AuthorizationCode_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OAuth2AuthorizationCode_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuth2AccessToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "app_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "refresh_token_hash" TEXT,
    "scopes" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuth2AccessToken_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OAuth2AccessToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuth2Grant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "app_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuth2Grant_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OAuth2Grant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "note_user_id" TEXT NOT NULL,
    "note_content" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "UserNote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserNote_note_user_id_fkey" FOREIGN KEY ("note_user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "friend_sync" BOOLEAN NOT NULL DEFAULT false,
    "show_activity" BOOLEAN NOT NULL DEFAULT false,
    "visibility" INTEGER NOT NULL DEFAULT 0,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" DATETIME,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConnectedAccount_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "application_id" TEXT,
    "name" TEXT,
    "state" TEXT,
    "details" TEXT,
    "timestamps" TEXT,
    "session_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserActivity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serialized" TEXT NOT NULL,
    "serialized_source_guild" TEXT,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "is_dirty" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "GuildTemplate_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildTemplate_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildScheduledEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "creator_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scheduled_start_time" DATETIME NOT NULL,
    "scheduled_end_time" DATETIME,
    "entity_type" INTEGER NOT NULL DEFAULT 1,
    "privacy_level" INTEGER NOT NULL DEFAULT 2,
    "recurrence_rule" TEXT,
    "entity_metadata" TEXT,
    "user_count" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 1,
    "image" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildScheduledEvent_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildScheduledEventUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscribed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildScheduledEventUser_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "GuildScheduledEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildScheduledEventUser_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildWelcomeChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "emoji_id" TEXT,
    "description" TEXT NOT NULL,
    "screen_id" TEXT,
    CONSTRAINT "GuildWelcomeChannel_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildWelcomeChannel_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildWelcomeChannel_screen_id_fkey" FOREIGN KEY ("screen_id") REFERENCES "GuildWelcomeScreen" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "privacy_level" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageInstance_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceState" (
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel_id" TEXT,
    "session_id" TEXT,
    "deaf" BOOLEAN NOT NULL DEFAULT false,
    "mute" BOOLEAN NOT NULL DEFAULT false,
    "self_deaf" BOOLEAN NOT NULL DEFAULT false,
    "self_mute" BOOLEAN NOT NULL DEFAULT false,
    "self_video" BOOLEAN NOT NULL DEFAULT false,
    "suppress" BOOLEAN NOT NULL DEFAULT false,
    "request_to_speak_timestamp" DATETIME,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceState_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildWidget" (
    "guild_id" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channel_id" TEXT,
    CONSTRAINT "GuildWidget_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ThreadMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "thread_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "join_timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flags" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ThreadMember_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThreadMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

-- CreateTable
CREATE TABLE "DataExport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "include_attachments" BOOLEAN NOT NULL DEFAULT false,
    "size_bytes" INTEGER,
    "error" TEXT,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME
);

-- CreateTable
CREATE TABLE "ApplicationRoleConnectionMetadata" (
    "application_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_localizations" TEXT,
    "description" TEXT NOT NULL,
    "description_localizations" TEXT,
    "type" INTEGER NOT NULL,

    PRIMARY KEY ("application_id", "key")
);

-- CreateTable
CREATE TABLE "GuildRoleConnectionRequirement" (
    "guild_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "metadata_key" TEXT NOT NULL,
    "metadata_value" TEXT NOT NULL,

    PRIMARY KEY ("guild_id", "role_id", "application_id", "metadata_key"),
    CONSTRAINT "GuildRoleConnectionRequirement_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildRoleConnectionRequirement_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildRoleConnectionRequirement_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserApplicationRoleConnection" (
    "user_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "platform_name" TEXT,
    "platform_username" TEXT,
    "metadata" TEXT,

    PRIMARY KEY ("user_id", "application_id")
);

-- CreateTable
CREATE TABLE "StatusMonitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "endpoint" TEXT,
    "interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StatusCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monitor_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "error" TEXT,
    "checked_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusCheck_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "StatusMonitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatusIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME
);

-- CreateTable
CREATE TABLE "StatusIncidentUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incident_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusIncidentUpdate_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "StatusIncident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatusMaintenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduled_start" DATETIME NOT NULL,
    "scheduled_end" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "auto_maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChannelFollower" (
    "source_channel_id" TEXT NOT NULL,
    "target_channel_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("source_channel_id", "target_channel_id"),
    CONSTRAINT "ChannelFollower_source_channel_id_fkey" FOREIGN KEY ("source_channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelFollower_target_channel_id_fkey" FOREIGN KEY ("target_channel_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelFollower_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForumTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "name" TEXT NOT NULL,
    "emoji_id" TEXT,
    "emoji_name" TEXT,
    "moderated" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumTag_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppliedTag" (
    "thread_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    PRIMARY KEY ("thread_id", "tag_id"),
    CONSTRAINT "AppliedTag_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AppliedTag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "ForumTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscoveryCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "label_key" TEXT,
    "icon" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GuildDiscoveryTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    CONSTRAINT "GuildDiscoveryTag_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeaturedGuild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "featured_by" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "featured_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeaturedGuild_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeaturedGuild_featured_by_fkey" FOREIGN KEY ("featured_by") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "application_id" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "guild_id" TEXT,
    "channel_id" TEXT,
    "user_id" TEXT,
    "token" TEXT NOT NULL,
    "data" TEXT,
    "responded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Interaction_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildWelcomeScreen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildWelcomeScreen_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildOnboarding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" INTEGER NOT NULL DEFAULT 0,
    "prompts" TEXT NOT NULL,
    "default_channel_ids" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildOnboarding_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildMemberVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "form_fields" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildMemberVerification_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_discriminator_key" ON "User"("username", "discriminator");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_vanity_url_code_key" ON "Guild"("vanity_url_code");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_message_id_key" ON "Poll"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "PollAnswer_poll_id_user_id_key" ON "PollAnswer"("poll_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_message_id_user_id_emoji_name_emoji_id_key" ON "Reaction"("message_id", "user_id", "emoji_name", "emoji_id");

-- CreateIndex
CREATE UNIQUE INDEX "Pin_channel_id_message_id_key" ON "Pin"("channel_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionOverwrite_channel_id_target_id_target_type_key" ON "PermissionOverwrite"("channel_id", "target_id", "target_type");

-- CreateIndex
CREATE UNIQUE INDEX "Ban_guild_id_user_id_key" ON "Ban"("guild_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Emoji_guild_id_name_key" ON "Emoji"("guild_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_user_id_badge_id_key" ON "UserBadge"("user_id", "badge_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_user_id_key" ON "UserSubscription"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_stripe_subscription_id_key" ON "UserSubscription"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "Friend_user_id_target_id_key" ON "Friend"("user_id", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "Plugin_slug_key" ON "Plugin"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StripeEvent_event_id_key" ON "StripeEvent"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_user_id_guild_id_key" ON "NotificationSettings"("user_id", "guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_user_id_channel_id_key" ON "NotificationSettings"("user_id", "channel_id");

-- CreateIndex
CREATE INDEX "ApplicationCommand_guild_id_idx" ON "ApplicationCommand"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationCommand_application_id_name_key" ON "ApplicationCommand"("application_id", "name");

-- CreateIndex
CREATE INDEX "ApplicationCommandPermission_command_id_idx" ON "ApplicationCommandPermission"("command_id");

-- CreateIndex
CREATE INDEX "ApplicationCommandPermission_application_id_idx" ON "ApplicationCommandPermission"("application_id");

-- CreateIndex
CREATE INDEX "ApplicationCommandPermission_guild_id_idx" ON "ApplicationCommandPermission"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "OAuth2AuthorizationCode_code_key" ON "OAuth2AuthorizationCode"("code");

-- CreateIndex
CREATE INDEX "OAuth2AuthorizationCode_app_id_idx" ON "OAuth2AuthorizationCode"("app_id");

-- CreateIndex
CREATE INDEX "OAuth2AuthorizationCode_user_id_idx" ON "OAuth2AuthorizationCode"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "OAuth2AccessToken_token_key" ON "OAuth2AccessToken"("token");

-- CreateIndex
CREATE INDEX "OAuth2AccessToken_app_id_idx" ON "OAuth2AccessToken"("app_id");

-- CreateIndex
CREATE INDEX "OAuth2AccessToken_user_id_idx" ON "OAuth2AccessToken"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "OAuth2Grant_app_id_user_id_key" ON "OAuth2Grant"("app_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserNote_user_id_note_user_id_key" ON "UserNote"("user_id", "note_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_user_id_type_key" ON "ConnectedAccount"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "GuildTemplate_code_key" ON "GuildTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GuildScheduledEventUser_event_id_user_id_key" ON "GuildScheduledEventUser"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "GuildWelcomeChannel_guild_id_channel_id_key" ON "GuildWelcomeChannel"("guild_id", "channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "StageInstance_channel_id_key" ON "StageInstance"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceState_guild_id_user_id_key" ON "VoiceState"("guild_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadMember_thread_id_user_id_key" ON "ThreadMember"("thread_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserGameLibrary_user_id_name_key" ON "UserGameLibrary"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GuildAnalyticsSnapshot_guild_id_date_key" ON "GuildAnalyticsSnapshot"("guild_id", "date");

-- CreateIndex
CREATE INDEX "DataExport_user_id_idx" ON "DataExport"("user_id");

-- CreateIndex
CREATE INDEX "DataExport_status_idx" ON "DataExport"("status");

-- CreateIndex
CREATE INDEX "StatusMonitor_enabled_idx" ON "StatusMonitor"("enabled");

-- CreateIndex
CREATE INDEX "StatusCheck_monitor_id_idx" ON "StatusCheck"("monitor_id");

-- CreateIndex
CREATE INDEX "StatusCheck_checked_at_idx" ON "StatusCheck"("checked_at");

-- CreateIndex
CREATE INDEX "StatusIncident_status_idx" ON "StatusIncident"("status");

-- CreateIndex
CREATE INDEX "StatusIncidentUpdate_incident_id_idx" ON "StatusIncidentUpdate"("incident_id");

-- CreateIndex
CREATE INDEX "StatusMaintenance_status_idx" ON "StatusMaintenance"("status");

-- CreateIndex
CREATE INDEX "ChannelFollower_target_channel_id_idx" ON "ChannelFollower"("target_channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "ForumTag_guild_id_name_key" ON "ForumTag"("guild_id", "name");

-- CreateIndex
CREATE INDEX "GuildDiscoveryTag_guild_id_idx" ON "GuildDiscoveryTag"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "GuildDiscoveryTag_guild_id_tag_key" ON "GuildDiscoveryTag"("guild_id", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "FeaturedGuild_guild_id_key" ON "FeaturedGuild"("guild_id");

-- CreateIndex
CREATE INDEX "Interaction_application_id_idx" ON "Interaction"("application_id");

-- CreateIndex
CREATE INDEX "Interaction_guild_id_idx" ON "Interaction"("guild_id");

-- CreateIndex
CREATE INDEX "Interaction_channel_id_idx" ON "Interaction"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "GuildWelcomeScreen_guild_id_key" ON "GuildWelcomeScreen"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "GuildOnboarding_guild_id_key" ON "GuildOnboarding"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "GuildMemberVerification_guild_id_key" ON "GuildMemberVerification"("guild_id");
