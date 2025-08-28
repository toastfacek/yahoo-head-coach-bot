#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';

async function createDiscordUserTable() {
  const prisma = new PrismaClient();

  try {
    console.log('🔄 Creating DiscordUser table...');

    // Create the DiscordUser table using raw SQL
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "DiscordUser" (
        "id" TEXT NOT NULL,
        "discordId" TEXT NOT NULL,
        "discordUsername" TEXT NOT NULL,
        "userId" TEXT,
        "isAuthenticated" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "DiscordUser_pkey" PRIMARY KEY ("id")
      );
    `;

    // Add unique constraints
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "DiscordUser_discordId_key" ON "DiscordUser"("discordId");
    `;

    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "DiscordUser_userId_key" ON "DiscordUser"("userId");
    `;

    // Add foreign key constraint
    await prisma.$executeRaw`
      ALTER TABLE "DiscordUser" 
      ADD CONSTRAINT IF NOT EXISTS "DiscordUser_userId_fkey" 
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    `;

    console.log('✅ DiscordUser table created successfully!');

    // Test the table
    const count = await prisma.$queryRaw`SELECT COUNT(*) FROM "DiscordUser"`;
    console.log('📊 DiscordUser table is ready. Current row count:', count);
  } catch (error) {
    console.error('❌ Error creating DiscordUser table:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  createDiscordUserTable()
    .then(() => {
      console.log('🎉 Database migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}
