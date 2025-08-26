#!/usr/bin/env ts-node
/**
 * Test database connection to diagnose Supabase connectivity issues
 */
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

// Load environment variables
dotenv.config({ path: '../../../../.env' });

console.log('🔍 Database Connection Diagnostic Tool');
console.log('=====================================');

// Parse the DATABASE_URL to understand its components
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL not found in environment');
  process.exit(1);
}

console.log('🔗 Connection URL Components:');
try {
  const url = new URL(dbUrl);
  console.log(`  Protocol: ${url.protocol}`);
  console.log(`  Host: ${url.hostname}`);
  console.log(`  Port: ${url.port}`);
  console.log(`  Database: ${url.pathname.slice(1)}`);
  console.log(`  Username: ${url.username}`);
  console.log(`  Password: ${url.password ? '[REDACTED]' : '[MISSING]'}`);
} catch (e) {
  console.error('❌ Invalid DATABASE_URL format:', e);
  process.exit(1);
}

async function testConnections() {
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is undefined');
    return;
  }
  
  // Test different connection string variants and modes
  const directUrl = dbUrl.replace('aws-0-us-east-2.pooler.supabase.com:6543', 'db.awiyuoivkhemdkpoxniz.supabase.co:5432');
  const sessionUrl = dbUrl + '?pgbouncer=true&connection_limit=1';
  const transactionUrl = dbUrl.replace('?', '&').replace('6543', '6543?pgbouncer=true');
  
  console.log('\n🔄 Testing Connection Variants:');
  console.log(`   Original (pooler): ${dbUrl.substring(0, 50)}...`);
  console.log(`   Direct: ${directUrl.substring(0, 50)}...`);
  console.log(`   Session: ${sessionUrl.substring(0, 50)}...`);

  // Test 1: Raw PostgreSQL connection with pooler
  console.log('\n📊 Test 1A: Raw PostgreSQL Connection (Pooler)');
  console.log('===============================================');

  let client = new pg.Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
    statement_timeout: 10000,
  });

  try {
    console.log('⏳ Attempting pooler connection...');
    await client.connect();
    console.log('✅ Pooler connection successful!');
    
    const result = await client.query('SELECT version()');
    console.log('📋 PostgreSQL Version:', result.rows[0]?.version?.substring(0, 50) + '...');
    
    await client.end();
  } catch (error: any) {
    console.error('❌ Pooler connection failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    console.error(`   Hint: ${error.hint || 'N/A'}`);
  }

  // Test 1B: Raw PostgreSQL connection with direct connection
  console.log('\n📊 Test 1B: Raw PostgreSQL Connection (Direct)');
  console.log('===============================================');

  client = new pg.Client({
    connectionString: directUrl,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
    statement_timeout: 10000,
  });

  try {
    console.log('⏳ Attempting direct connection...');
    await client.connect();
    console.log('✅ Direct connection successful!');
    
    const result = await client.query('SELECT version()');
    console.log('📋 PostgreSQL Version:', result.rows[0]?.version?.substring(0, 50) + '...');
    
    await client.end();
  } catch (error: any) {
    console.error('❌ Direct connection failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    console.error(`   Hint: ${error.hint || 'N/A'}`);
  }

  // Test 2A: Prisma Client connection with pooler
  console.log('\n📊 Test 2A: Prisma Client Connection (Pooler)');
  console.log('===============================================');

  let prisma = new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'pretty',
    datasources: {
      db: {
        url: dbUrl
      }
    }
  });

  try {
    console.log('⏳ Attempting Prisma pooler connection...');
    await prisma.$connect();
    console.log('✅ Prisma pooler connection successful!');
    
    // Test a simple query
    console.log('⏳ Testing simple query...');
    const result = await prisma.$queryRaw`SELECT current_database(), current_user, version()`;
    console.log('📋 Database Info:', result);
    
  } catch (error: any) {
    console.error('❌ Prisma pooler connection failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    if (error.meta) {
      console.error('   Meta:', error.meta);
    }
  } finally {
    await prisma.$disconnect();
  }

  // Test 2B: Prisma Client connection with direct
  console.log('\n📊 Test 2B: Prisma Client Connection (Direct)');
  console.log('==============================================');

  prisma = new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'pretty',
    datasources: {
      db: {
        url: directUrl
      }
    }
  });

  try {
    console.log('⏳ Attempting Prisma direct connection...');
    await prisma.$connect();
    console.log('✅ Prisma direct connection successful!');
    
    // Test a simple query
    console.log('⏳ Testing simple query...');
    const result = await prisma.$queryRaw`SELECT current_database(), current_user, version()`;
    console.log('📋 Database Info:', result);
    
  } catch (error: any) {
    console.error('❌ Prisma direct connection failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    if (error.meta) {
      console.error('   Meta:', error.meta);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n🔚 Connection test complete');
}

testConnections().catch(console.error);