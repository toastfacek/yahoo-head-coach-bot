// Test individual route imports to find the hanging module
require('dotenv').config({ path: '.env' });

console.log('🔍 Testing Route Imports');

async function testRouteImports() {
  try {
    console.log('Step 1: Testing health route...');
    require('./apps/orchestrator/src/routes/health');
    console.log('✅ Health route imported successfully');

    console.log('Step 2: Testing reports route...');
    setTimeout(() => {
      console.log('❌ HANG DETECTED in reports route import');
      process.exit(1);
    }, 5000);
    require('./apps/orchestrator/src/routes/reports');
    console.log('✅ Reports route imported successfully');

    console.log('Step 3: Testing oauth route...');
    setTimeout(() => {
      console.log('❌ HANG DETECTED in oauth route import');
      process.exit(1);
    }, 5000);
    require('./apps/orchestrator/src/routes/oauth');
    console.log('✅ OAuth route imported successfully');

    console.log('Step 4: Testing lineup route...');
    setTimeout(() => {
      console.log('❌ HANG DETECTED in lineup route import');
      process.exit(1);
    }, 5000);
    require('./apps/orchestrator/src/routes/lineup');
    console.log('✅ Lineup route imported successfully');

    console.log('Step 5: Testing waivers route...');
    setTimeout(() => {
      console.log('❌ HANG DETECTED in waivers route import');
      process.exit(1);
    }, 5000);
    require('./apps/orchestrator/src/routes/waivers');
    console.log('✅ Waivers route imported successfully');

    console.log('Step 6: Testing approvals route...');
    setTimeout(() => {
      console.log('❌ HANG DETECTED in approvals route import');
      process.exit(1);
    }, 5000);
    require('./apps/orchestrator/src/routes/approvals');
    console.log('✅ Approvals route imported successfully');

    console.log('Step 7: Testing memory route...');
    setTimeout(() => {
      console.log('❌ HANG DETECTED in memory route import');
      process.exit(1);
    }, 5000);
    require('./apps/orchestrator/src/routes/memory');
    console.log('✅ Memory route imported successfully');

    console.log('Step 8: Testing scheduler route...');
    setTimeout(() => {
      console.log('❌ HANG DETECTED in scheduler route import');
      process.exit(1);
    }, 5000);
    require('./apps/orchestrator/src/routes/scheduler');
    console.log('✅ Scheduler route imported successfully');

    console.log('🎉 ALL ROUTE IMPORTS SUCCESSFUL');
    process.exit(0);

  } catch (error) {
    console.log('❌ ERROR during route import:', error.message);
    console.log('🎯 ROOT CAUSE:', error.stack);
    process.exit(1);
  }
}

testRouteImports();