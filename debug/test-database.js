// Test 2a: Isolated Prisma database connection test
require('dotenv').config({ path: './.env' });

console.log('🔍 Testing Prisma database connection...');
console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);

const startTime = Date.now();

// Set a timeout to detect hanging database connections
const timeout = setTimeout(() => {
  console.log('❌ HANG DETECTED: Database connection took > 15 seconds');
  console.log('🎯 ROOT CAUSE IDENTIFIED: Database connection timeout/hang');
  process.exit(1);
}, 15000);

async function testDatabase() {
  try {
    console.log('Step 1: Importing Prisma Client...');
    const { PrismaClient } = require('@prisma/client');
    
    console.log('Step 2: Creating Prisma client instance...');
    const prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
    
    console.log('Step 3: Testing database connection...');
    // Try a simple query with timeout
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1 as test`,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 10000)
      )
    ]);
    
    console.log('✅ Database query successful:', result);
    
    console.log('Step 4: Testing prisma models...');
    const userCount = await prisma.user.count();
    console.log('✅ User count query successful:', userCount);
    
    await prisma.$disconnect();
    
    clearTimeout(timeout);
    const totalTime = Date.now() - startTime;
    console.log(`✅ SUCCESS: Database connection test completed in ${totalTime}ms`);
    console.log('🎉 CONCLUSION: Database is NOT the cause of the hang');
    
  } catch (error) {
    clearTimeout(timeout);
    console.log('❌ DATABASE ERROR:', error.message);
    console.log('🎯 ROOT CAUSE: Database connection issue');
    console.log('Error details:', error);
    
    if (error.message.includes('timeout')) {
      console.log('💡 This is likely causing the server hang');
    }
    
    process.exit(1);
  }
}

testDatabase();