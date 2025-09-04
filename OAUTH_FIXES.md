# OAuth and Orchestrator Connection Fixes

This document summarizes the fixes applied to resolve the OAuth and orchestrator connection issues identified in [GitHub Issue #3](https://github.com/toastfacek/yahoo-head-coach-bot/issues/3).

## Issues Identified and Fixed

### 1. ORCHESTRATOR_URL Configuration ✅

**Problem**: Discord bot was defaulting to `localhost:3000` when `ORCHESTRATOR_URL` was not set, causing connection failures in production.

**Fix**: 
- Made `ORCHESTRATOR_URL` a required environment variable in `apps/discord-bot/src/utils/config.ts`
- Added proper validation and clear error messages when the variable is missing
- Added startup logging to show the configured URL and warn about localhost usage

**Files Changed**:
- `apps/discord-bot/src/utils/config.ts`

### 2. Database Connection Issues ✅

**Problem**: Database connection failures were causing the system to fall back to in-memory store without proper health reporting.

**Fix**:
- Enhanced database health checks in `apps/orchestrator/src/db.ts` with timeout handling
- Updated health endpoint to include database connectivity status
- Improved server startup to handle database connection failures gracefully

**Files Changed**:
- `apps/orchestrator/src/routes/health.ts`
- `apps/orchestrator/src/db.ts` (already had good error handling)

### 3. Health Check Improvements ✅

**Problem**: Intermittent API health check failures between Discord bot and orchestrator weren't providing enough diagnostic information.

**Fix**:
- Enhanced health check response to include database status, latency, and service information
- Improved Discord bot health check handling with better error categorization
- Added specific error messages for connection refused, timeouts, and other network issues

**Files Changed**:
- `apps/discord-bot/src/services/orchestratorApi.ts`
- `apps/orchestrator/src/routes/health.ts`

### 4. OAuth Error Handling ✅

**Problem**: OAuth callback failures provided generic error messages that didn't help users understand what went wrong.

**Fix**:
- Added detailed error handling for state validation failures
- Implemented specific user guidance based on error types (expired, invalid, network issues)
- Enhanced logging for OAuth callback debugging
- Improved fallback OAuth flow with better user notifications

**Files Changed**:
- `apps/orchestrator/src/routes/oauth.ts`
- `apps/discord-bot/src/commands/auth.ts`

## New Tools and Scripts

### Environment Setup Script
- **File**: `scripts/setup-env.sh`
- **Purpose**: Validates all required environment variables are set
- **Usage**: `./scripts/setup-env.sh`

### OAuth Flow Test Script  
- **File**: `scripts/test-oauth-flow.sh`
- **Purpose**: Tests the complete OAuth integration between Discord bot and orchestrator
- **Usage**: `./scripts/test-oauth-flow.sh`

## Configuration Changes

### Required Environment Variables

The Discord bot now **requires** the following environment variables:

```bash
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Critical: Must be set to the actual orchestrator URL
ORCHESTRATOR_URL=http://localhost:3000  # for development
# ORCHESTRATOR_URL=https://your-domain.com  # for production

# Database
DATABASE_URL=postgresql://username:password@host:port/database

# Yahoo OAuth
YAHOO_CLIENT_ID=your_yahoo_client_id
YAHOO_CLIENT_SECRET=your_yahoo_client_secret
YAHOO_REDIRECT_URI=http://localhost:3000/api/oauth/callback

# AI Configuration
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## Testing the Fixes

### 1. Environment Validation
```bash
./scripts/setup-env.sh
```

### 2. Integration Testing
```bash
# Start orchestrator
cd apps/orchestrator
npm run dev

# In another terminal, test OAuth flow
./scripts/test-oauth-flow.sh
```

### 3. End-to-End Testing
```bash
# Start Discord bot
cd apps/discord-bot  
npm run dev

# Test in Discord
/auth login
```

## Error Handling Improvements

### For Users
- Clear error messages explaining what went wrong
- Step-by-step instructions for fixing common issues
- Automatic fallback to backup authentication when orchestrator is unavailable
- Progress indicators and status updates

### For Developers
- Detailed logging with request IDs and timestamps
- Database connectivity status in health checks
- Network error categorization (connection refused, timeout, etc.)
- OAuth state validation debugging information

## Deployment Considerations

### Development Environment
1. Ensure both orchestrator and Discord bot are running
2. Use `localhost` URLs in environment variables
3. Database can be local PostgreSQL or remote (Supabase)

### Production Environment  
1. Set `ORCHESTRATOR_URL` to actual production domain
2. Use HTTPS URLs for all external-facing endpoints
3. Ensure database connectivity from both services
4. Configure Yahoo OAuth redirect URI to match production domain

## Monitoring and Diagnostics

The enhanced health checks now provide:
- Database connectivity status and latency
- Service uptime and version information
- Environment and configuration status
- Detailed error information for troubleshooting

Access health information at:
- Orchestrator: `GET /api/health`
- Discord bot health checks are logged automatically

## Common Issues and Solutions

### "ORCHESTRATOR_URL not set"
- **Cause**: Missing environment variable
- **Fix**: Set `ORCHESTRATOR_URL` in your environment or `.env` file

### "Database connection failed"
- **Cause**: Database is unreachable or credentials are wrong
- **Fix**: Verify `DATABASE_URL` and database accessibility

### "OAuth session creation failed"
- **Cause**: Orchestrator is down or misconfigured
- **Fix**: Check orchestrator logs, verify Yahoo OAuth configuration

### "Health check timeout"
- **Cause**: Orchestrator is overloaded or network issues
- **Fix**: Check server resources, network connectivity

## Success Indicators

When everything is working correctly, you should see:
- ✅ All environment variables validated
- ✅ Health checks passing with database connected
- ✅ OAuth session creation succeeding
- ✅ Discord auth commands working without fallback warnings
- ✅ Successful Yahoo authentication flow

The system is now more robust with better error handling, clearer diagnostics, and improved user experience during OAuth failures.