import { PrismaClient } from '@prisma/client';

// Singleton Prisma client for the orchestrator
export const prisma = new PrismaClient();

