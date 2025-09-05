# Discord Bot Health Check Fix

## Problem Summary

The Discord bot was failing Railway health checks, causing deployment failures with "service unavailable" errors after 5 minutes of retry attempts.

## Root Causes Identified

1. **Port Configuration**: Health server wasn't using Railway's `PORT` environment variable
2. **Host Binding**: Server wasn't binding to `0.0.0.0` (required for Railway external health checks) 
3. **Health Check Timeout**: Railway was timing out too quickly (needed more time for Discord bot startup)
4. **Startup Order**: Health server needed to start before other potentially-failing initialization steps
5. **Missing Error Handling**: No graceful handling of health server startup failures

## Solutions Implemented

### 1. Fixed Health Server Configuration

**File**: `apps/discord-bot/src/healthServer.ts`

**Changes**:
- ✅ Use `PORT` env var (Railway standard) with fallback to `DISCORD_HEALTH_PORT`
- ✅ Bind to `0.0.0.0` host (required for Railway health checks)
- ✅ Enhanced logging with startup status and error handling
- ✅ Added uptime and timestamp to health responses
- ✅ Graceful error handling that doesn't crash the bot

```javascript
const port = Number(process.env.PORT || process.env.DISCORD_HEALTH_PORT || 8081);
const host = '0.0.0.0'; // Required for Railway health checks
```

### 2. Improved Bot Startup Sequence

**File**: `apps/discord-bot/src/bot.ts`

**Changes**:
- ✅ Start health server FIRST, before any other initialization
- ✅ Added environment debugging for Railway deployment
- ✅ Better error handling with clear logging
- ✅ Health server stays up even if Discord login fails

### 3. Updated Railway Configuration

**File**: `railway.toml`

**Changes**:
- ✅ Added `healthcheckTimeout = 300` (5 minutes to start up)
- ✅ Added `NODE_OPTIONS = "--max-old-space-size=512"` for memory management
- ✅ Kept `healthcheckPath = "/health"` pointing to correct endpoint

## Expected Log Output

When working correctly, you should see:

```
🌍 Environment debug: {
  NODE_ENV: 'production',
  PORT: '8080',
  SERVICE: 'discord',
  hasDiscordToken: true,
  hasOrchestratorUrl: true,
  hasDatabaseUrl: true
}
🚀 Starting Discord bot initialization...
🏥 Starting health server on 0.0.0.0:8080...
✅ Discord health server listening on 0.0.0.0:8080
Loaded 6 slash commands
```

## Testing Health Check

### Local Testing
```bash
cd apps/discord-bot
PORT=8080 npm run dev
# In another terminal:
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "discord-bot", 
  "timestamp": "2025-01-09T13:35:03.269Z",
  "uptime": 15.23
}
```

### Railway Testing

After deployment, Railway will automatically test:
- `GET https://your-discord-bot-domain.railway.app/health`
- Should return 200 status within 5 minutes

## Troubleshooting

### If Health Check Still Fails

1. **Check Railway Logs for Environment Debug Output**:
   - Look for `🌍 Environment debug:` log
   - Verify `PORT` is set by Railway
   - Verify `SERVICE=discord` is correct

2. **Look for Health Server Startup Messages**:
   ```
   ✅ Discord health server listening on 0.0.0.0:PORT
   ```

3. **Check for Startup Errors**:
   ```
   ❌ Health server failed to start - this will cause deployment issues
   ```

4. **Test Health Endpoint Manually**:
   - Use Railway's provided domain + `/health`
   - Should return 200 status with JSON response

### Common Issues

- **"Port already in use"**: Check if multiple processes are trying to use the same port
- **"Service unavailable"**: Health server likely not starting due to startup error
- **"Connection refused"**: Host binding issue (should be `0.0.0.0` not `127.0.0.1`)
- **Timeout errors**: Increase `healthcheckTimeout` in `railway.toml`

## Files Modified

1. `apps/discord-bot/src/healthServer.ts` - Fixed port/host configuration
2. `apps/discord-bot/src/bot.ts` - Improved startup sequence and debugging  
3. `railway.toml` - Added health check timeout and memory limits
4. `HEALTH_CHECK_FIX.md` - This documentation

## Next Steps After Deployment

1. ✅ **Deploy the changes** to Railway
2. ✅ **Monitor startup logs** for health server messages
3. ✅ **Verify health endpoint** responds at `/health`
4. ✅ **Test Discord bot functionality** after successful deployment

The health check should now pass within 5 minutes of deployment startup.