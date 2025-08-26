#!/usr/bin/env ts-node
// Simple setup checker - doesn't require Yahoo API imports

console.log('🔍 Yahoo Fantasy Bot Setup Checker\n');

// Check environment variables
console.log('1. Checking environment variables...');
const requiredEnvVars = [
  'YAHOO_CLIENT_ID',
  'YAHOO_CLIENT_SECRET', 
  'YAHOO_REDIRECT_URI',
  'ANTHROPIC_API_KEY',
  'DATABASE_URL'
];

const envFile = require('dotenv').config({ path: '../../.env' });
const missingVars: string[] = [];

requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`   ✅ ${varName}: ${value.substring(0, 10)}...`);
  } else {
    console.log(`   ❌ ${varName}: Missing`);
    missingVars.push(varName);
  }
});

if (missingVars.length > 0) {
  console.log('\n⚠️  Missing required environment variables:', missingVars.join(', '));
  console.log('\n💡 To fix this:');
  console.log('1. Make sure you have a .env file in the project root');
  console.log('2. Add the missing variables to your .env file');
  console.log('3. Get Yahoo credentials from: https://developer.yahoo.com/apps/');
  console.log('4. Get Anthropic API key from: https://console.anthropic.com/');
  process.exit(1);
}

console.log('\n✅ All environment variables are set!');

// Check if server starts
console.log('\n2. Checking server configuration...');
console.log('   - Yahoo redirect URI should be: http://localhost:3000/api/oauth/callback');
console.log('   - Make sure this matches your Yahoo app settings');

console.log('\n3. Next steps:');
console.log('   1. Start the server: npm run dev');
console.log('   2. Authorize with Yahoo: http://localhost:3000/api/oauth/start?userId=dev');
console.log('   3. Test your team connection through the API endpoints');

console.log('\n🎉 Setup check complete! You should be ready to connect to Yahoo Fantasy.');

export {};