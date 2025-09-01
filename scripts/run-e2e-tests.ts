#!/usr/bin/env tsx

/**
 * E2E Test Runner Script
 * 
 * Comprehensive test runner for the Discord OAuth flow refactor validation.
 * Runs all E2E tests with proper environment setup and reporting.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const TEST_CATEGORIES = [
  {
    name: 'Test Configuration',
    file: 'test-config.test.ts',
    description: 'Validates test environment and dependencies'
  },
  {
    name: 'OAuth Session Management',
    file: 'oauth-session.test.ts', 
    description: 'JWT state management and session creation'
  },
  {
    name: 'Discord Commands',
    file: 'discord-commands.test.ts',
    description: 'Discord interaction patterns and command handling'
  },
  {
    name: 'Button Handlers',
    file: 'button-handlers.test.ts',
    description: 'Discord button interactions and component handling'
  },
  {
    name: 'Complete OAuth Flow',
    file: 'oauth-complete-flow.test.ts',
    description: 'End-to-end user journey from Discord to Yahoo'
  },
  {
    name: 'API Integration', 
    file: 'api-integration.test.ts',
    description: 'Orchestrator and Yahoo API integration'
  },
  {
    name: 'Orchestrator-Discord Integration',
    file: 'orchestrator-discord-integration.test.ts',
    description: 'Cross-service communication and data flow'
  },
  {
    name: 'Security & Robustness',
    file: 'security-robustness.test.ts',
    description: 'Security tests and attack vector validation'
  }
];

interface TestResult {
  category: string;
  file: string;
  passed: boolean;
  duration: number;
  output: string;
}

class E2ETestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  async run(): Promise<void> {
    console.log('🚀 Starting E2E Test Suite for Discord OAuth Flow Refactor\n');
    console.log('📋 Test Categories:');
    TEST_CATEGORIES.forEach((category, index) => {
      console.log(`   ${index + 1}. ${category.name} - ${category.description}`);
    });
    console.log('');

    this.startTime = Date.now();

    // Check if all test files exist
    await this.validateTestFiles();

    // Run tests sequentially with detailed reporting
    for (const category of TEST_CATEGORIES) {
      await this.runTestCategory(category);
    }

    // Generate summary report
    this.generateSummaryReport();
  }

  private async validateTestFiles(): Promise<void> {
    console.log('🔍 Validating test files...');
    
    const testDir = path.join(__dirname, '../tests/e2e');
    
    for (const category of TEST_CATEGORIES) {
      const filePath = path.join(testDir, category.file);
      try {
        await fs.access(filePath);
        console.log(`   ✅ ${category.file}`);
      } catch (error) {
        console.error(`   ❌ Missing: ${category.file}`);
        process.exit(1);
      }
    }
    console.log('');
  }

  private async runTestCategory(category: typeof TEST_CATEGORIES[0]): Promise<void> {
    console.log(`📝 Running: ${category.name}`);
    console.log(`   File: ${category.file}`);
    console.log(`   Description: ${category.description}`);

    const startTime = Date.now();
    
    try {
      const result = await this.executeTest(category.file);
      const duration = Date.now() - startTime;
      
      this.results.push({
        category: category.name,
        file: category.file,
        passed: result.success,
        duration,
        output: result.output
      });

      if (result.success) {
        console.log(`   ✅ PASSED (${duration}ms)\n`);
      } else {
        console.log(`   ❌ FAILED (${duration}ms)`);
        console.log(`   Error: ${result.output.split('\n').slice(-5).join('\n')}\n`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`   ❌ FAILED (${duration}ms)`);
      console.log(`   Error: ${error}\n`);
      
      this.results.push({
        category: category.name,
        file: category.file,
        passed: false,
        duration,
        output: String(error)
      });
    }
  }

  private executeTest(testFile: string): Promise<{success: boolean, output: string}> {
    return new Promise((resolve) => {
      const testPath = path.join(__dirname, '../tests/e2e', testFile);
      const vitest = spawn('npx', ['vitest', 'run', testPath, '--reporter=verbose'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let output = '';
      
      vitest.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      vitest.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      vitest.on('close', (code) => {
        resolve({
          success: code === 0,
          output
        });
      });
    });
  }

  private generateSummaryReport(): void {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => r.passed === false).length;
    const total = this.results.length;

    console.log('📊 E2E Test Summary Report');
    console.log('=' .repeat(50));
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log('');

    if (passed > 0) {
      console.log('✅ Passed Tests:');
      this.results
        .filter(r => r.passed)
        .forEach(result => {
          console.log(`   • ${result.category} (${result.duration}ms)`);
        });
      console.log('');
    }

    if (failed > 0) {
      console.log('❌ Failed Tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`   • ${result.category} (${result.duration}ms)`);
          console.log(`     Error: ${result.output.split('\n').slice(-3).join(' ').slice(0, 100)}...`);
        });
      console.log('');
    }

    console.log('🎯 Test Coverage Areas Validated:');
    console.log('   • JWT-based OAuth state management');
    console.log('   • Discord interaction locks and patterns');
    console.log('   • Security improvements and attack prevention');
    console.log('   • End-to-end user journey flows');
    console.log('   • API integration and error handling');
    console.log('   • Cross-service communication');
    console.log('');

    if (failed === 0) {
      console.log('🎉 All E2E tests passed! The Discord OAuth flow refactor is validated.');
    } else {
      console.log('⚠️  Some tests failed. Please review the errors above.');
      process.exit(1);
    }
  }
}

// Run the test suite if this file is executed directly
if (require.main === module) {
  const runner = new E2ETestRunner();
  runner.run().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

export { E2ETestRunner, TEST_CATEGORIES };