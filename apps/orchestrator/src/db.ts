import { PrismaClient } from '@prisma/client';

// Enhanced Prisma client configuration for production use
const createPrismaClient = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    errorFormat: 'pretty',
    
    // Connection configuration optimized for Supabase
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });
};

// Singleton pattern with proper connection handling
class DatabaseManager {
  private static instance: DatabaseManager;
  private _prisma: PrismaClient | null = null;
  private connectionPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async connect(): Promise<PrismaClient> {
    if (this._prisma) {
      return this._prisma;
    }

    // Ensure only one connection attempt at a time
    if (!this.connectionPromise) {
      this.connectionPromise = this.establishConnection();
    }

    await this.connectionPromise;
    return this._prisma!;
  }

  private async establishConnection(): Promise<void> {
    try {
      console.log('🔄 Establishing database connection...');
      this._prisma = createPrismaClient();
      
      // Test the connection with timeout
      await Promise.race([
        this._prisma.$connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database connection timeout')), 10000)
        )
      ]);
      
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      this._prisma = null;
      this.connectionPromise = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this._prisma) {
      await this._prisma.$disconnect();
      this._prisma = null;
      this.connectionPromise = null;
      console.log('🔌 Database disconnected');
    }
  }

  get client(): PrismaClient {
    if (!this._prisma) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this._prisma;
  }

  // Health check method
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    if (!this._prisma) {
      return { healthy: false, error: 'Not connected' };
    }

    try {
      const start = Date.now();
      await this._prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;
      return { healthy: true, latency };
    } catch (error: any) {
      return { healthy: false, error: error.message };
    }
  }
}

// Export singleton instance and convenience methods
const dbManager = DatabaseManager.getInstance();

export const connectDatabase = () => dbManager.connect();
export const disconnectDatabase = () => dbManager.disconnect();
export const getDatabaseHealth = () => dbManager.healthCheck();

// Lazy-loading prisma client with automatic connection
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    if (!dbManager.client) {
      throw new Error('Database not connected. Call connectDatabase() first.');
    }
    return Reflect.get(dbManager.client, prop, receiver);
  }
});

// For backwards compatibility, also export a direct client
export const directPrisma = () => dbManager.client;

