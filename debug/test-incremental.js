// Test 3a: Incremental module loading to find exact hang point
// Load environment first
require('dotenv').config({ path: './.env' });

console.log('🔍 Incremental Module Loading Test');
console.log('Environment loaded ✅');

async function testIncrementalLoading() {
  try {
    console.log('Step 1: Testing basic Express import...');
    const express = require('express');
    console.log('✅ Express imported successfully');

    console.log('Step 2: Testing cors import...');
    const cors = require('cors');
    console.log('✅ CORS imported successfully');

    console.log('Step 3: Testing helmet import...');
    const helmet = require('helmet');
    console.log('✅ Helmet imported successfully');

    console.log('Step 4: Testing pino-http import...');
    const pinoHttp = require('pino-http');
    console.log('✅ Pino-http imported successfully');

    console.log('Step 5: Testing rate limiting import...');
    const rateLimit = require('express-rate-limit');
    console.log('✅ Rate limit imported successfully');

    console.log('Step 6: Testing env config import...');
    const startTime = Date.now();
    const { env } = require('./src/config/env');
    const envTime = Date.now() - startTime;
    console.log(`✅ Env config imported successfully in ${envTime}ms`);
    console.log('PORT:', env.PORT);

    console.log('Step 7: Testing routes import...');
    const routeStartTime = Date.now();
    
    // Set a timeout specifically for routes import since this might be where it hangs
    const routeTimeout = setTimeout(() => {
      console.log('❌ HANG DETECTED during routes import');
      console.log('🎯 ROOT CAUSE: Routes module import issue');
      process.exit(1);
    }, 15000);
    
    const router = require('./src/routes');
    clearTimeout(routeTimeout);
    const routeTime = Date.now() - routeStartTime;
    console.log(`✅ Routes imported successfully in ${routeTime}ms`);

    console.log('Step 8: Creating Express app...');
    const app = express();
    console.log('✅ Express app created');

    console.log('Step 9: Adding middleware...');
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    console.log('✅ Middleware added');

    console.log('Step 10: Adding routes...');
    app.use('/api', router);
    console.log('✅ Routes added');

    console.log('Step 11: Starting server...');
    const server = app.listen(3001, () => {
      console.log('🎉 SUCCESS: Server started on port 3001!');
      console.log('🔍 CONCLUSION: No hang detected in incremental loading');
      server.close();
      process.exit(0);
    });

    // Set timeout to detect hang
    setTimeout(() => {
      console.log('❌ HANG DETECTED during server.listen()');
      console.log('🎯 ROOT CAUSE: Server binding or port conflict');
      server.close();
      process.exit(1);
    }, 10000);

  } catch (error) {
    console.log('❌ ERROR during incremental loading:', error.message);
    console.log('🎯 ROOT CAUSE IDENTIFIED at import step');
    console.log('Error details:', error.stack);
    process.exit(1);
  }
}

testIncrementalLoading();