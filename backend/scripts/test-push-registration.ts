/**
 * Test Script: Push Token Registration & Mobile Flow
 * 
 * Tests the backend push-token endpoints that the mobile app will use:
 * 1. Register a push token
 * 2. Duplicate registration (idempotent)
 * 3. Token reassignment (device changes accounts)
 * 4. Token removal (logout)
 * 5. Invalid token format rejection
 * 6. Missing token rejection
 * 7. Multiple tokens per user (multiple devices)
 * 8. Remove non-existent token (graceful)
 */

import { prisma } from '../src/config/database';
import http from 'http';

const BASE_URL = 'http://localhost:3000/api';

// Simple HTTP helper (no axios dependency in backend)
function request(
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:3000');
    const postData = body ? JSON.stringify(body) : '';
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (body) reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 0, data });
          }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    console.log(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

async function getAuthToken(userId: string): Promise<string> {
  // Use the backend's own JWT utility so the secret matches
  const { generateAccessToken } = require('../src/utils/jwt');
  return generateAccessToken(userId);
}

async function main() {
  console.log('\n🧪 Push Token Registration Tests\n');
  console.log('='.repeat(50));

  // Get two test users
  const users = await prisma.user.findMany({ take: 2 });
  if (users.length < 2) {
    console.log('❌ Need at least 2 users in the database');
    process.exit(1);
  }

  const user1 = users[0];
  const user2 = users[1];
  const token1 = await getAuthToken(user1.id);
  const token2 = await getAuthToken(user2.id);

  const headers1 = { Authorization: `Bearer ${token1}` };
  const headers2 = { Authorization: `Bearer ${token2}` };

  // Clean up any test tokens before we start
  await prisma.pushToken.deleteMany({
    where: {
      token: {
        in: [
          'ExponentPushToken[test-device-1]',
          'ExponentPushToken[test-device-2]',
          'ExponentPushToken[test-device-3]',
        ],
      },
    },
  });

  // -------------------------------------------
  // Test 1: Register a push token
  // -------------------------------------------
  console.log('\n📋 Test 1: Register a push token');
  try {
    const res = await request('POST', '/api/users/push-token',
      { token: 'ExponentPushToken[test-device-1]', platform: 'ios' }, headers1);
    if (!res.data.success) {
      console.log('    Debug: status =', res.status, 'data =', JSON.stringify(res.data).substring(0, 200));
    }
    assert(res.data.success === true, 'Registration returns success');

    const dbToken = await prisma.pushToken.findUnique({
      where: { token: 'ExponentPushToken[test-device-1]' },
    });
    assert(dbToken !== null, 'Token exists in database');
    assert(dbToken?.userId === user1.id, 'Token belongs to user1');
    assert(dbToken?.platform === 'ios', 'Platform is ios');
  } catch (err: any) {
    assert(false, 'Registration request', err.message);
  }

  // -------------------------------------------
  // Test 2: Duplicate registration (idempotent)
  // -------------------------------------------
  console.log('\n📋 Test 2: Duplicate registration (idempotent)');
  try {
    const res = await request('POST', '/api/users/push-token',
      { token: 'ExponentPushToken[test-device-1]', platform: 'ios' }, headers1);
    assert(res.data.success === true, 'Duplicate registration succeeds');

    const count = await prisma.pushToken.count({
      where: { token: 'ExponentPushToken[test-device-1]' },
    });
    assert(count === 1, 'Only one record exists (no duplicates)');
  } catch (err: any) {
    assert(false, 'Duplicate registration', err.message);
  }

  // -------------------------------------------
  // Test 3: Token reassignment (device changes accounts)
  // -------------------------------------------
  console.log('\n📋 Test 3: Token reassignment (device changes accounts)');
  try {
    const res = await request('POST', '/api/users/push-token',
      { token: 'ExponentPushToken[test-device-1]', platform: 'ios' }, headers2);
    assert(res.data.success === true, 'Reassignment returns success');

    const dbToken = await prisma.pushToken.findUnique({
      where: { token: 'ExponentPushToken[test-device-1]' },
    });
    assert(dbToken?.userId === user2.id, 'Token now belongs to user2');
  } catch (err: any) {
    assert(false, 'Token reassignment', err.message);
  }

  // -------------------------------------------
  // Test 4: Multiple tokens per user (multiple devices)
  // -------------------------------------------
  console.log('\n📋 Test 4: Multiple tokens per user');
  try {
    await request('POST', '/api/users/push-token',
      { token: 'ExponentPushToken[test-device-2]', platform: 'android' }, headers2);

    const userTokens = await prisma.pushToken.findMany({
      where: { userId: user2.id, token: { startsWith: 'ExponentPushToken[test-device-' } },
    });
    assert(userTokens.length === 2, `User has 2 tokens (found ${userTokens.length})`);
    
    const platforms = userTokens.map(t => t.platform).sort();
    assert(platforms.includes('android') && platforms.includes('ios'), 'Both platforms registered');
  } catch (err: any) {
    assert(false, 'Multiple tokens', err.message);
  }

  // -------------------------------------------
  // Test 5: Invalid token format rejection
  // -------------------------------------------
  console.log('\n📋 Test 5: Invalid token format rejection');
  try {
    const res = await request('POST', '/api/users/push-token',
      { token: 'not-a-valid-token', platform: 'ios' }, headers1);
    assert(res.status === 400, 'Returns 400 for invalid token');
    assert(
      res.data?.error?.message?.includes('Invalid Expo push token'),
      'Error message mentions invalid format'
    );
  } catch (err: any) {
    assert(false, 'Invalid token rejection', err.message);
  }

  // -------------------------------------------
  // Test 6: Missing token rejection
  // -------------------------------------------
  console.log('\n📋 Test 6: Missing token rejection');
  try {
    const res = await request('POST', '/api/users/push-token',
      { platform: 'ios' }, headers1);
    assert(res.status === 400, 'Returns 400 for missing token');
  } catch (err: any) {
    assert(false, 'Missing token rejection', err.message);
  }

  // -------------------------------------------
  // Test 7: Token removal (logout)
  // -------------------------------------------
  console.log('\n📋 Test 7: Token removal (logout)');
  try {
    const res = await request('DELETE', '/api/users/push-token',
      { token: 'ExponentPushToken[test-device-1]' }, headers2);
    assert(res.data.success === true, 'Removal returns success');

    const dbToken = await prisma.pushToken.findUnique({
      where: { token: 'ExponentPushToken[test-device-1]' },
    });
    assert(dbToken === null, 'Token removed from database');

    const remaining = await prisma.pushToken.findUnique({
      where: { token: 'ExponentPushToken[test-device-2]' },
    });
    assert(remaining !== null, 'Other token still exists');
  } catch (err: any) {
    assert(false, 'Token removal', err.message);
  }

  // -------------------------------------------
  // Test 8: Remove non-existent token (graceful)
  // -------------------------------------------
  console.log('\n📋 Test 8: Remove non-existent token (graceful)');
  try {
    const res = await request('DELETE', '/api/users/push-token',
      { token: 'ExponentPushToken[does-not-exist]' }, headers1);
    assert(res.data.success === true, 'Gracefully handles non-existent token');
  } catch (err: any) {
    assert(false, 'Non-existent token removal', err.message);
  }

  // -------------------------------------------
  // Test 9: Unauthenticated request rejected
  // -------------------------------------------
  console.log('\n📋 Test 9: Unauthenticated request rejected');
  try {
    const res = await request('POST', '/api/users/push-token',
      { token: 'ExponentPushToken[test-device-3]', platform: 'ios' });
    assert(res.status === 401, 'Returns 401 for unauthenticated');
  } catch (err: any) {
    assert(false, 'Unauthenticated rejection', err.message);
  }

  // -------------------------------------------
  // Test 10: Platform defaults to ios
  // -------------------------------------------
  console.log('\n📋 Test 10: Platform defaults to ios');
  try {
    await request('POST', '/api/users/push-token',
      { token: 'ExponentPushToken[test-device-3]' }, headers1);

    const dbToken = await prisma.pushToken.findUnique({
      where: { token: 'ExponentPushToken[test-device-3]' },
    });
    assert(dbToken?.platform === 'ios', 'Platform defaults to ios when not provided');
  } catch (err: any) {
    assert(false, 'Platform default', err.message);
  }

  // -------------------------------------------
  // Cleanup
  // -------------------------------------------
  await prisma.pushToken.deleteMany({
    where: {
      token: {
        in: [
          'ExponentPushToken[test-device-1]',
          'ExponentPushToken[test-device-2]',
          'ExponentPushToken[test-device-3]',
        ],
      },
    },
  });

  // -------------------------------------------
  // Summary
  // -------------------------------------------
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

  if (failed > 0) {
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Test script failed:', err);
  process.exit(1);
});
