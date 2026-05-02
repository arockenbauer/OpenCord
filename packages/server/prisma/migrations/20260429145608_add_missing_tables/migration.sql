/*
  Warnings:

  - The primary key for the `NotificationSettings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `id` to the `NotificationSettings` table without a default value. This is not possible if the table is not empty.

*/
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
    "reported_user_id" TEXT NOT NULL,
    "guild_id" TEXT,
    "channel_id" TEXT,
    "message_id" TEXT,
    "reason" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderator_id" TEXT,
    "resolution" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME,
    CONSTRAINT "Report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Report_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "platform" TEXT NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "platform_username" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
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
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serialized" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "GuildTemplate_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "entity_type" INTEGER NOT NULL DEFAULT 3,
    "entity_metadata" TEXT,
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
    CONSTRAINT "GuildScheduledEventUser_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "GuildScheduledEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "ThreadMember_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThreadMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Channel" (
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Channel_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Channel" ("bitrate", "created_at", "default_auto_archive_duration", "guild_id", "id", "last_message_id", "name", "nsfw", "parent_id", "position", "slowmode_delay", "topic", "type", "updated_at", "user_limit") SELECT "bitrate", "created_at", "default_auto_archive_duration", "guild_id", "id", "last_message_id", "name", "nsfw", "parent_id", "position", "slowmode_delay", "topic", "type", "updated_at", "user_limit" FROM "Channel";
DROP TABLE "Channel";
ALTER TABLE "new_Channel" RENAME TO "Channel";
CREATE TABLE "new_NotificationSettings" (
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
INSERT INTO "new_NotificationSettings" ("channel_id", "guild_id", "message_notifications", "muted", "suppress_everyone", "suppress_roles", "user_id") SELECT "channel_id", "guild_id", "message_notifications", "muted", "suppress_everyone", "suppress_roles", "user_id" FROM "NotificationSettings";
DROP TABLE "NotificationSettings";
ALTER TABLE "new_NotificationSettings" RENAME TO "NotificationSettings";
CREATE UNIQUE INDEX "NotificationSettings_user_id_guild_id_key" ON "NotificationSettings"("user_id", "guild_id");
CREATE UNIQUE INDEX "NotificationSettings_user_id_channel_id_key" ON "NotificationSettings"("user_id", "channel_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Poll_message_id_key" ON "Poll"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "PollAnswer_poll_id_user_id_key" ON "PollAnswer"("poll_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserNote_user_id_note_user_id_key" ON "UserNote"("user_id", "note_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_user_id_platform_platform_user_id_key" ON "ConnectedAccount"("user_id", "platform", "platform_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "GuildScheduledEventUser_event_id_user_id_key" ON "GuildScheduledEventUser"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "StageInstance_channel_id_key" ON "StageInstance"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceState_guild_id_user_id_key" ON "VoiceState"("guild_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadMember_thread_id_user_id_key" ON "ThreadMember"("thread_id", "user_id");
