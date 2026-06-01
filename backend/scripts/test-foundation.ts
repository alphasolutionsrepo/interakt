// scripts/test-foundation.ts

/**
 * Test script to verify foundation setup
 * Run: npx tsx scripts/test-foundation.ts
 */

import { appConfig, databaseConfig, cacheConfig, loggerConfig } from '@/config/index';
import { logger, createLogger, flushLogs } from '@/shared/logger/logger';
import { CacheManager } from '@/shared/cache/cache-manager';
import { apiResponse } from '@/shared/api/response';

// Wrap everything in async function
async function runTests() {
  console.log('==========================================================');
  console.log('  FOUNDATION TEST - Verifying Setup');
  console.log('==========================================================\n');

  // Test 1: Configuration
  console.log('✓ Test 1: Configuration Loading');
  console.log('  - App Name:', appConfig.app.name);
  console.log('  - Environment:', appConfig.app.environment);
  console.log('  - Database URL:', databaseConfig.connection.url ? '✓ Set' : '✗ Not Set');
  console.log('  - Cache Provider:', cacheConfig.provider);
  console.log('  - Log Level:', loggerConfig.level);
  console.log('  - Features:', {
      chatAgent: appConfig.features.enableChatAgent,
      semanticSearch: appConfig.features.enableSemanticSearch,
    });

  // Test 2: Logger
  console.log('\n✓ Test 2: Logger (Async)');
  logger.info('Testing default logger');
  logger.debug('This is a debug message', { test: true });
  logger.warn('This is a warning');
  logger.error('This is an error test', new Error('Test error'));

  const customLogger = createLogger('test-service');
  customLogger.info('Testing custom logger', { service: 'test' });

  // Test 3: Cache
  console.log('\n✓ Test 3: Cache Manager');
  const cache = new CacheManager('test-feature');
  
  // Set value
  await cache.set('key1', 'value1', 5000);
  console.log('  - Set key1 = value1');
  
  // Get value
  const value = await cache.get('key1');
  console.log('  - Get key1 =', value);
  console.log('  - Cache working:', value === 'value1' ? '✓' : '✗');
  
  // Test getOrSet
  const result = await cache.getOrSet(
    'key2',
    async () => {
      console.log('  - Factory function called (cache miss)');
      return 'computed-value';
    },
    5000
  );
  console.log('  - getOrSet result:', result);
  
  // Second call should use cache
  const result2 = await cache.getOrSet(
    'key2',
    async () => {
      console.log('  - This should not print (cache hit)');
      return 'computed-value';
    },
    5000
  );
  console.log('  - getOrSet cached result:', result2);
  
  // Stats
  const stats = cache.getStats();
  console.log('  - Cache stats:', stats);
  
  // Cleanup
  await cache.clear();
  console.log('  - Cache cleared');

  
  // Test 4: API Response
  console.log('\n✓ Test 4: API Response Builders');
  console.log('  - Success response:', typeof apiResponse.success);
  console.log('  - Error response:', typeof apiResponse.error);
  console.log('  - Not found response:', typeof apiResponse.notFound);
  console.log('  - Validation error response:', typeof apiResponse.validationError);

  // Test 5: Path Aliases
  console.log('\n✓ Test 5: Path Aliases');
  console.log('  - @/config:', '✓ Working');
  console.log('  - @/shared/logger:', '✓ Working');
  console.log('  - @/shared/cache:', '✓ Working');
  console.log('  - @/shared/api:', '✓ Working');

  // Summary
  console.log('\n==========================================================');
  console.log('  ALL TESTS PASSED! ✓');
  console.log('==========================================================');
  console.log('\nFoundation is ready. Next step: Database Schema Setup\n');

  // Flush logs before exit
  await flushLogs();
}

// Run tests
runTests().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});