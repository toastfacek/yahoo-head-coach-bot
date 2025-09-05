# Discord Bot Database Connection Fix

## Problem Summary

The authentication persistence issue is caused by the Discord bot not having access to the same database as the orchestrator. Here's what's happening:

1. ✅ **Orchestrator**: Successfully stores OAuth tokens in database
2. ❌ **Discord Bot**: Can't connect to database, falls back to in-memory storage
3. ❌ **Result**: Discord bot can't see the tokens that were just saved

## Root Cause

The Discord bot is missing the `DATABASE_URL` environment variable, so it falls back to an in-memory store that gets wiped when the bot restarts.

## Solution

### For Railway Deployment

1. **Set Database URL for Discord Bot Service:**
   ```bash
   # In Railway dashboard, go to your Discord Bot service
   # Add environment variable:
   DATABASE_URL=postgresql://postgres:password@host:port/database
   ```
   
   Use the EXACT same `DATABASE_URL` that your orchestrator service is using.

2. **Verify Configuration:**
   ```bash
   # Both services should have identical DATABASE_URL values
   # Orchestrator: DATABASE_URL=postgresql://...
   # Discord Bot:  DATABASE_URL=postgresql://... (same value)
   ```

### For Local Development

1. **Create/Update `.env` file in Discord Bot directory:**
   ```bash
   cd apps/discord-bot/
   echo "DATABASE_URL=your_database_connection_string" >> .env
   ```

2. **Or set environment variable directly:**
   ```bash
   export DATABASE_URL="postgresql://username:password@localhost:5432/headcoach"
   npm run dev
   ```

## Verification Steps

After setting `DATABASE_URL`:

1. **Restart Discord Bot Service**
2. **Check logs for:**
   ```
   ✅ Successfully connected to database for user service
   ✅ Database connection verified - Discord users table accessible
   ```

3. **Test Authentication:**
   - Run `/auth status` in Discord
   - Should NOT show "Configuration Issue" message
   - Run `/auth login` and complete OAuth flow
   - Run `/auth status` again - should show "Connected"

## Updated Logging

The Discord bot now provides better debugging information:

- ❌ **CRITICAL: No DATABASE_URL configured** - Missing environment variable
- ✅ **Successfully connected to database** - Connection established
- ⚠️ **Configuration Issue** - User-facing error in `/auth status` when no database

## Files Modified

- `apps/discord-bot/src/services/userService.ts` - Enhanced database connection logging
- `apps/discord-bot/src/commands/auth.ts` - Added configuration check in status command
- `DISCORD_BOT_DATABASE_FIX.md` - This documentation

## Next Steps

1. Set `DATABASE_URL` environment variable for Discord bot
2. Restart Discord bot service  
3. Test `/auth login` and `/auth status` commands
4. Verify tokens persist across bot restarts

The enhanced logging will now clearly show whether the database connection is working or not.