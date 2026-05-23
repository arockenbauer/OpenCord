-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "colors" TEXT DEFAULT '{}',
    "hoist" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "permissions" BIGINT NOT NULL DEFAULT 0,
    "mentionable" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT,
    "unicode_emoji" TEXT,
    "managed" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT DEFAULT '{}',
    "flags" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Role" ("color", "created_at", "guild_id", "hoist", "icon", "id", "managed", "mentionable", "name", "permissions", "position", "unicode_emoji") SELECT "color", "created_at", "guild_id", "hoist", "icon", "id", "managed", "mentionable", "name", "permissions", "position", "unicode_emoji" FROM "Role";
DROP TABLE "Role";
ALTER TABLE "new_Role" RENAME TO "Role";
CREATE TABLE "new_SoundboardSound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "volume" REAL NOT NULL DEFAULT 1.0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "SoundboardSound_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SoundboardSound_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SoundboardSound" ("available", "created_at", "created_by", "emoji", "file_path", "guild_id", "id", "mime_type", "name", "updated_at", "volume") SELECT "available", "created_at", "created_by", "emoji", "file_path", "guild_id", "id", "mime_type", "name", "updated_at", "volume" FROM "SoundboardSound";
DROP TABLE "SoundboardSound";
ALTER TABLE "new_SoundboardSound" RENAME TO "SoundboardSound";
CREATE UNIQUE INDEX "SoundboardSound_guild_id_name_key" ON "SoundboardSound"("guild_id", "name");
CREATE TABLE "new_VoiceState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT,
    "dm_channel_id" TEXT,
    "channel_id" TEXT,
    "session_id" TEXT,
    "deaf" BOOLEAN NOT NULL DEFAULT false,
    "mute" BOOLEAN NOT NULL DEFAULT false,
    "self_deaf" BOOLEAN NOT NULL DEFAULT false,
    "self_mute" BOOLEAN NOT NULL DEFAULT false,
    "self_video" BOOLEAN NOT NULL DEFAULT false,
    "suppress" BOOLEAN NOT NULL DEFAULT false,
    "call_status" TEXT NOT NULL DEFAULT 'idle',
    "request_to_speak_timestamp" DATETIME,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceState_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VoiceState" ("channel_id", "deaf", "guild_id", "id", "mute", "request_to_speak_timestamp", "self_deaf", "self_mute", "self_video", "session_id", "suppress", "updated_at", "user_id") SELECT "channel_id", "deaf", "guild_id", "id", "mute", "request_to_speak_timestamp", "self_deaf", "self_mute", "self_video", "session_id", "suppress", "updated_at", "user_id" FROM "VoiceState";
DROP TABLE "VoiceState";
ALTER TABLE "new_VoiceState" RENAME TO "VoiceState";
CREATE INDEX "VoiceState_dm_channel_id_idx" ON "VoiceState"("dm_channel_id");
CREATE UNIQUE INDEX "VoiceState_guild_id_user_id_key" ON "VoiceState"("guild_id", "user_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
