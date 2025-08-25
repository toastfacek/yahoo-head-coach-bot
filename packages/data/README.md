# Data Package

This package contains the database schema and Prisma configuration for the Yahoo Fantasy Football Bot.

## Setup

### 1. Environment Variables

The `.env` file has been created with a template DATABASE_URL. You need to:

1. Replace `YOUR_PASSWORD` with your actual Supabase database password
2. You can find this in your Supabase project settings under Database > Connection string

### 2. Database Migration

The initial database schema has been applied to your Supabase project. The tables include:

- `User` - User accounts
- `YahooToken` - OAuth tokens for Yahoo API
- `League` - Fantasy football leagues
- `LeagueUser` - League membership
- `Team` - Team rosters and data
- `Signal` - Data signals (injuries, news, etc.)
- `Recommendation` - AI-generated recommendations
- `Decision` - User decisions on recommendations
- `LeagueSnapshot` - Historical league snapshots
- `CostLog` - API cost tracking

### 3. Prisma Client

The Prisma client has been generated and is ready to use.

## Usage

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Example: Create a user
const user = await prisma.user.create({
  data: {
    email: 'user@example.com'
  }
})
```

## Development

To make schema changes:

1. Update `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <migration_name>`
3. The migration will be applied to your Supabase database

## Supabase Project

- **Project ID**: `awiyuoivkhemdkpoxniz`
- **Region**: `us-east-2`
- **Status**: Active and Healthy

## Security Notes

⚠️ **Security Advisory**: Row Level Security (RLS) is currently disabled on all tables. This is acceptable for development, but should be enabled for production use. You can enable RLS in the Supabase dashboard under Authentication > Policies.
