import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DiscordUserMapping } from '../types/discord';
import { authLogger } from '../utils/logger';

// Note: We'll extend the existing Prisma schema to include Discord user mappings
// For now, we'll use a simple in-memory store and prepare for database integration

export class UserService {
  private prisma: PrismaClient | null = null;
  private userMappings = new Map<string, DiscordUserMapping>();

  constructor() {
    try {
      this.prisma = new PrismaClient();
      authLogger.info('Connected to database for user service');
    } catch (error) {
      authLogger.warn(error, 'Database connection failed, using in-memory store');
    }
  }

  async getUser(discordId: string): Promise<DiscordUserMapping | null> {
    try {
      if (this.prisma) {
        const user = await this.prisma.discordUser.findUnique({
          where: { discordId },
          include: { user: true }
        });
        
        if (user) {
          return {
            discordId: user.discordId,
            discordUsername: user.discordUsername,
            yahooUserId: user.userId,
            isAuthenticated: user.isAuthenticated,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          };
        }
      }
      
      return this.userMappings.get(discordId) || null;
    } catch (error) {
      authLogger.error({ error, discordId }, 'Failed to get user');
      return null;
    }
  }

  async createOrUpdateUser(discordId: string, discordUsername: string): Promise<DiscordUserMapping> {
    try {
      if (this.prisma) {
        // Upsert to avoid race conditions and satisfy NOT NULL id
        const user = await this.prisma.discordUser.upsert({
          where: { discordId },
          update: {
            discordUsername,
            updatedAt: new Date(),
          },
          create: {
            id: discordId, // stable primary key; avoids requiring DB defaults
            discordId,
            discordUsername,
            isAuthenticated: false,
          },
          include: { user: true },
        });
        authLogger.info({ discordId, discordUsername }, 'Upserted user mapping');
        
        return {
          discordId: user.discordId,
          discordUsername: user.discordUsername,
          yahooUserId: user.userId,
          isAuthenticated: user.isAuthenticated,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        };
      }

      // Fallback to in-memory store
      const userData: DiscordUserMapping = {
        discordId,
        discordUsername,
        yahooUserId: undefined,
        isAuthenticated: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const existingUser = this.userMappings.get(discordId);
      if (existingUser) {
        existingUser.discordUsername = discordUsername;
        existingUser.updatedAt = new Date();
        this.userMappings.set(discordId, existingUser);
        return existingUser;
      }

      this.userMappings.set(discordId, userData);
      authLogger.info({ discordId, discordUsername }, 'Created new user mapping (in-memory)');
      return userData;
    } catch (error) {
      authLogger.error({ error, discordId, discordUsername }, 'Failed to create/update user');
      throw error;
    }
  }

  async linkYahooAccount(discordId: string, yahooUserId: string): Promise<void> {
    try {
      if (this.prisma) {
        await this.prisma.discordUser.update({
          where: { discordId },
          data: { 
            userId: yahooUserId,
            isAuthenticated: true,
            updatedAt: new Date(),
          }
        });
        
        authLogger.info({ discordId, yahooUserId }, 'Linked Yahoo account');
        return;
      }

      const user = this.userMappings.get(discordId);
      if (user) {
        user.yahooUserId = yahooUserId;
        user.isAuthenticated = true;
        user.updatedAt = new Date();
        this.userMappings.set(discordId, user);
      }

      authLogger.info({ discordId, yahooUserId }, 'Linked Yahoo account (in-memory)');
    } catch (error) {
      authLogger.error({ error, discordId, yahooUserId }, 'Failed to link Yahoo account');
      throw error;
    }
  }

  async unlinkYahooAccount(discordId: string): Promise<void> {
    try {
      if (this.prisma) {
        await this.prisma.discordUser.update({
          where: { discordId },
          data: { 
            userId: null,
            isAuthenticated: false,
            updatedAt: new Date(),
          }
        });
        
        authLogger.info({ discordId }, 'Unlinked Yahoo account');
        return;
      }

      const user = this.userMappings.get(discordId);
      if (user) {
        user.yahooUserId = undefined;
        user.isAuthenticated = false;
        user.updatedAt = new Date();
        this.userMappings.set(discordId, user);
      }

      authLogger.info({ discordId }, 'Unlinked Yahoo account (in-memory)');
    } catch (error) {
      authLogger.error({ error, discordId }, 'Failed to unlink Yahoo account');
      throw error;
    }
  }

  async isAuthenticated(discordId: string): Promise<boolean> {
    const user = await this.getUser(discordId);
    return user?.isAuthenticated || false;
  }

  async getYahooUserId(discordId: string): Promise<string | null> {
    const user = await this.getUser(discordId);
    return user?.yahooUserId || null;
  }

  async getAllUsers(): Promise<DiscordUserMapping[]> {
    try {
      if (this.prisma) {
        const users = await this.prisma.discordUser.findMany({
          include: { user: true }
        });
        
        return users.map(user => ({
          discordId: user.discordId,
          discordUsername: user.discordUsername,
          yahooUserId: user.userId,
          isAuthenticated: user.isAuthenticated,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }));
      }
      
      return Array.from(this.userMappings.values());
    } catch (error) {
      authLogger.error(error, 'Failed to get all users');
      return [];
    }
  }

  async cleanup(): Promise<void> {
    if (this.prisma) {
      await this.prisma.$disconnect();
    }
  }
}

export const userService = new UserService();
