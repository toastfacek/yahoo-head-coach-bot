-- SQL script to create DiscordUser table for Yahoo Fantasy Football Discord Bot
-- Run this in your Supabase SQL editor or any PostgreSQL client

-- Create DiscordUser table
CREATE TABLE IF NOT EXISTS "DiscordUser" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "discordId" TEXT NOT NULL,
    "discordUsername" TEXT NOT NULL,
    "userId" TEXT,
    "isAuthenticated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordUser_pkey" PRIMARY KEY ("id")
);

-- Create unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "DiscordUser_discordId_key" ON "DiscordUser"("discordId");
CREATE UNIQUE INDEX IF NOT EXISTS "DiscordUser_userId_key" ON "DiscordUser"("userId");

-- Add foreign key constraint to link with User table
ALTER TABLE "DiscordUser" 
ADD CONSTRAINT "DiscordUser_userId_fkey" 
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create trigger to update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_discord_user_updated_at 
    BEFORE UPDATE ON "DiscordUser" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify the table was created
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'DiscordUser'
ORDER BY ordinal_position;