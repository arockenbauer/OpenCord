CREATE TABLE "SoundboardSound" (
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
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SoundboardSound_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SoundboardSound_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SoundboardSound_guild_id_name_key" ON "SoundboardSound"("guild_id", "name");
