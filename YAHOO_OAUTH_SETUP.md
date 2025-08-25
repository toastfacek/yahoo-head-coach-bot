# Yahoo OAuth App Setup Instructions

## Overview
To enable the HeadCoach bot to access Yahoo Fantasy Sports APIs, you need to create an OAuth application on Yahoo Developer Network.

## Step-by-Step Instructions

### 1. Access Yahoo Developer Network
- Go to https://developer.yahoo.com
- Sign in with your Yahoo account (create one if needed)

### 2. Create New Application
- Navigate to "My Apps" or click "Create an App"
- Fill out the application form with these details:

**Application Details:**
- **Application Name**: `Yahoo Fantasy HeadCoach Bot`
- **Description**: `AI-powered fantasy football management assistant that helps optimize lineups, manage waivers, and make strategic decisions`
- **Homepage URL**: `https://github.com/[your-username]/yahoo-fantasy-football-bot` (or your repository URL)
- **Application Type**: `Server-side Application`

**OAuth Configuration:**
- **Redirect URI**: `http://localhost:3000/api/oauth/callback`
- **API Permissions**: Select "Fantasy Sports" with **Read/Write** access
- **OAuth Scope Required**: `fspt-w` (Fantasy Sports Read/Write)

### 3. Submit and Get Approval
- Submit the application for review
- Wait for Yahoo's approval (usually quick for Fantasy Sports API)

### 4. Obtain Credentials
Once approved, you'll receive:
- **Client ID** (also called Consumer Key)
- **Client Secret** (also called Consumer Secret)

### 5. Configure Environment Variables
Add these credentials to your `.env` file in `apps/orchestrator/`:

```bash
# Yahoo OAuth Configuration
YAHOO_CLIENT_ID=your_actual_client_id_here
YAHOO_CLIENT_SECRET=your_actual_client_secret_here
YAHOO_REDIRECT_URI=http://localhost:3000/api/oauth/callback
```

## Important Notes

### Security
- Never commit your actual Client ID and Secret to version control
- The `.env` file should be in your `.gitignore`
- For production deployment, use environment variables or secure credential management

### API Permissions
- **Read/Write access (`fspt-w`)** is required for the full HeadCoach functionality
- This allows the bot to:
  - Read your fantasy teams and leagues
  - Make lineup changes
  - Submit waiver claims
  - Execute trades (with approval)

### Redirect URI
- Must match exactly what you configure in Yahoo Developer Network
- For local development: `http://localhost:3000/api/oauth/callback`
- For production: Update to your deployed domain

## Troubleshooting

### Common Issues
1. **Invalid redirect URI**: Ensure the URI in Yahoo Developer Network exactly matches your configuration
2. **Insufficient permissions**: Make sure you requested Fantasy Sports Read/Write access
3. **Scope errors**: Verify your app has the `fspt-w` scope enabled

### Testing the Setup
Once configured, you can test the OAuth flow by visiting:
`http://localhost:3000/api/oauth/start`

This should redirect you to Yahoo's login page, and after authentication, return you to the callback URL.

## Next Steps
After completing this setup:
1. Mark task 2.1 as complete in the roadmap
2. Proceed to implement OAuth routes (task 2.2)
3. Test the full OAuth flow end-to-end