// Direct server startup test without nodemon
require('dotenv').config({ path: '.env' });

console.log('🧪 Direct Server Startup Test');
console.log('Environment loaded ✅');

const startTime = Date.now();
let serverStarted = false;

// Set timeout to detect hang
const hangTimeout = setTimeout(() => {
  if (!serverStarted) {
    console.log('❌ SERVER HANG DETECTED');
    console.log('🎯 Server failed to start within 10 seconds');
    process.exit(1);
  }
}, 10000);

async function testServerStartup() {
  try {
    console.log('Step 1: Importing server modules...');
    
    // Import server.ts transpiled with ts-node
    const { spawn } = require('child_process');
    
    console.log('Step 2: Starting ts-node process...');
    const tsNodeProcess = spawn('npx', ['ts-node', 'apps/orchestrator/src/server.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    let output = '';
    let errorOutput = '';
    
    tsNodeProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('STDOUT:', text.trim());
      
      // Check for server started message
      if (text.includes('Server started') || text.includes('listening')) {
        console.log('✅ SERVER STARTED SUCCESSFULLY');
        serverStarted = true;
        clearTimeout(hangTimeout);
        tsNodeProcess.kill();
        process.exit(0);
      }
    });
    
    tsNodeProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.log('STDERR:', text.trim());
      
      // Check for specific error patterns
      if (text.includes('Function.prototype.apply')) {
        console.log('🎯 YAHOO-FANTASY LIBRARY ERROR DETECTED');
      }
      if (text.includes('timeout') || text.includes('ETIMEDOUT')) {
        console.log('🎯 DATABASE TIMEOUT ERROR DETECTED');
      }
    });
    
    tsNodeProcess.on('close', (code) => {
      if (!serverStarted) {
        console.log(`❌ Process exited with code ${code}`);
        console.log('Full output:', output);
        console.log('Full error:', errorOutput);
        clearTimeout(hangTimeout);
        process.exit(1);
      }
    });
    
    tsNodeProcess.on('error', (error) => {
      console.log('❌ Process error:', error.message);
      clearTimeout(hangTimeout);
      process.exit(1);
    });
    
  } catch (error) {
    console.log('❌ ERROR during server startup test:', error.message);
    clearTimeout(hangTimeout);
    process.exit(1);
  }
}

testServerStartup();