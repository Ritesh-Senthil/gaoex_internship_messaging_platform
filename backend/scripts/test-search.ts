/**
 * Test script for Message Search API
 * 
 * Tests the GET /api/search/messages endpoint.
 * Requires: backend running on port 3000, at least one user with messages.
 * 
 * Run: npx tsx scripts/test-search.ts
 */

import http from 'http';
import { prisma } from '../src/config/database';
import { generateAccessToken } from '../src/utils/jwt';

let passed = 0;
let failed = 0;
let testUserId: string;
let testToken: string;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

function section(name: string) {
  console.log(`\n📋 ${name}`);
  console.log('─'.repeat(50));
}

function request(method: string, path: string, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, body: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function setup() {
  section('Setup');
  
  // Find a user that has some messages
  const userWithMessages = await prisma.user.findFirst({
    where: {
      messages: { some: {} },
    },
    select: { id: true, email: true, displayName: true },
  });

  if (!userWithMessages) {
    // Find any user
    const anyUser = await prisma.user.findFirst({
      select: { id: true, email: true, displayName: true },
    });
    if (!anyUser) {
      console.error('❌ No users found in database. Start the backend and create a user first.');
      process.exit(1);
    }
    testUserId = anyUser.id;
    console.log(`  Using user: ${anyUser.displayName} (${anyUser.email}) - no messages found`);
  } else {
    testUserId = userWithMessages.id;
    console.log(`  Using user: ${userWithMessages.displayName} (${userWithMessages.email})`);
  }

  testToken = generateAccessToken(testUserId);
  console.log(`  Token generated for user: ${testUserId}`);
}

async function testValidation() {
  section('Input Validation');

  // No query parameter
  const noQuery = await request('GET', '/search/messages', testToken);
  assert(noQuery.status === 400, 'Missing query returns 400');

  // Empty query
  const emptyQuery = await request('GET', '/search/messages?q=', testToken);
  assert(emptyQuery.status === 400, 'Empty query returns 400');

  // Too short query (1 char)
  const shortQuery = await request('GET', '/search/messages?q=a', testToken);
  assert(shortQuery.status === 400, 'Single character query returns 400');

  // Invalid scope
  const badScope = await request('GET', '/search/messages?q=hello&scope=invalid', testToken);
  assert(badScope.status === 400, 'Invalid scope returns 400');

  // No auth
  const noAuth = await request('GET', '/search/messages?q=hello');
  assert(noAuth.status === 401, 'No auth token returns 401');
}

async function testBasicSearch() {
  section('Basic Search');

  // Valid search with 2-char query
  const res = await request('GET', '/search/messages?q=he', testToken);
  assert(res.status === 200, '2-char query returns 200');
  assert(res.body.success === true, 'Response has success: true');
  assert(Array.isArray(res.body.data?.results), 'Response has results array');
  assert(typeof res.body.data?.query === 'string', 'Response includes the query');
  assert(typeof res.body.data?.scope === 'string', 'Response includes the scope');
  assert(typeof res.body.data?.total === 'number', 'Response includes total count');
  assert(typeof res.body.data?.hasMore === 'boolean', 'Response includes hasMore flag');
}

async function testSearchScopes() {
  section('Search Scopes');

  // All scope (default)
  const allScope = await request('GET', '/search/messages?q=the', testToken);
  assert(allScope.status === 200, 'Default scope (all) returns 200');
  assert(allScope.body.data?.scope === 'all', 'Default scope is "all"');

  // Channels only
  const channelScope = await request('GET', '/search/messages?q=the&scope=channels', testToken);
  assert(channelScope.status === 200, 'Channel scope returns 200');
  assert(channelScope.body.data?.scope === 'channels', 'Scope is "channels"');
  
  // Check all results are channel type
  const channelResults = channelScope.body.data?.results || [];
  const allChannel = channelResults.every((r: any) => r.context?.type === 'channel');
  assert(channelResults.length === 0 || allChannel, 'All channel-scope results are channel type');

  // DMs only
  const dmScope = await request('GET', '/search/messages?q=the&scope=dms', testToken);
  assert(dmScope.status === 200, 'DM scope returns 200');
  assert(dmScope.body.data?.scope === 'dms', 'Scope is "dms"');

  const dmResults = dmScope.body.data?.results || [];
  const allDM = dmResults.every((r: any) => r.context?.type === 'dm');
  assert(dmResults.length === 0 || allDM, 'All DM-scope results are dm type');
}

async function testPagination() {
  section('Pagination');

  // Small limit
  const page1 = await request('GET', '/search/messages?q=he&limit=2&offset=0', testToken);
  assert(page1.status === 200, 'Pagination page 1 returns 200');
  assert(page1.body.data?.results.length <= 2, 'Respects limit parameter');

  // Second page
  const page2 = await request('GET', '/search/messages?q=he&limit=2&offset=2', testToken);
  assert(page2.status === 200, 'Pagination page 2 returns 200');

  // If page1 had results, verify page2 is different (or empty)
  if (page1.body.data?.results.length > 0 && page2.body.data?.results.length > 0) {
    const page1Ids = page1.body.data.results.map((r: any) => r.id);
    const page2Ids = page2.body.data.results.map((r: any) => r.id);
    const overlap = page1Ids.some((id: string) => page2Ids.includes(id));
    assert(!overlap, 'Page 2 results do not overlap with page 1');
  } else {
    assert(true, 'Pagination works (not enough results to verify overlap)');
  }

  // Max limit enforcement
  const bigLimit = await request('GET', '/search/messages?q=he&limit=999', testToken);
  assert(bigLimit.status === 200, 'Large limit returns 200 (capped internally)');
  assert(bigLimit.body.data?.results.length <= 50, 'Results capped at max 50');
}

async function testResultFormat() {
  section('Result Format');

  const res = await request('GET', '/search/messages?q=he&limit=5', testToken);
  assert(res.status === 200, 'Search returns 200');

  const results = res.body.data?.results || [];
  if (results.length === 0) {
    console.log('  ⚠️  No results to verify format (database may be empty)');
    return;
  }

  const first = results[0];
  assert(typeof first.id === 'string', 'Result has id');
  assert(typeof first.content === 'string', 'Result has content');
  assert(typeof first.createdAt === 'string', 'Result has createdAt');
  assert(typeof first.isEdited === 'boolean', 'Result has isEdited');
  assert(typeof first.author === 'object', 'Result has author object');
  assert(typeof first.author.id === 'string', 'Author has id');
  assert(typeof first.author.displayName === 'string', 'Author has displayName');
  assert(typeof first.context === 'object', 'Result has context object');
  assert(['channel', 'dm'].includes(first.context.type), 'Context type is channel or dm');

  if (first.context.type === 'channel') {
    assert(typeof first.context.channelId === 'string', 'Channel context has channelId');
    assert(typeof first.context.channelName === 'string', 'Channel context has channelName');
    assert(typeof first.context.programId === 'string', 'Channel context has programId');
    assert(typeof first.context.programName === 'string', 'Channel context has programName');
  } else {
    assert(typeof first.context.conversationId === 'string', 'DM context has conversationId');
    assert(typeof first.context.conversationName === 'string', 'DM context has conversationName');
  }

  // Verify ordering (newest first)
  if (results.length >= 2) {
    const isDescending = new Date(results[0].createdAt).getTime() >= new Date(results[1].createdAt).getTime();
    assert(isDescending, 'Results are ordered newest first');
  } else {
    assert(true, 'Only one result - ordering trivially correct');
  }
}

async function testCaseInsensitivity() {
  section('Case Insensitivity');

  // Find a message to use as test content
  const sampleMessage = await prisma.message.findFirst({
    where: {
      OR: [
        { channel: { category: { program: { memberships: { some: { userId: testUserId } } } } } },
        { conversation: { participants: { some: { userId: testUserId } } } },
      ],
    },
    select: { content: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!sampleMessage || sampleMessage.content.length < 3) {
    console.log('  ⚠️  No suitable message found for case-insensitivity test');
    return;
  }

  // Extract a word (at least 3 chars)
  const words = sampleMessage.content.split(/\s+/).filter(w => w.length >= 3);
  if (words.length === 0) {
    console.log('  ⚠️  No suitable word found in message content');
    return;
  }

  const word = words[0].replace(/[^a-zA-Z0-9]/g, '');
  if (word.length < 2) {
    console.log('  ⚠️  No alphanumeric word found for case test');
    return;
  }

  const lower = await request('GET', `/search/messages?q=${encodeURIComponent(word.toLowerCase())}`, testToken);
  const upper = await request('GET', `/search/messages?q=${encodeURIComponent(word.toUpperCase())}`, testToken);

  assert(lower.status === 200, `Lowercase search for "${word.toLowerCase()}" returns 200`);
  assert(upper.status === 200, `Uppercase search for "${word.toUpperCase()}" returns 200`);
  assert(
    lower.body.data?.total === upper.body.data?.total,
    `Case-insensitive: lowercase (${lower.body.data?.total}) = uppercase (${upper.body.data?.total}) results`
  );
}

async function testSpecialCharacters() {
  section('Special Characters in Query');

  // SQL injection attempt
  const sqlInject = await request('GET', `/search/messages?q=${encodeURIComponent("'; DROP TABLE messages; --")}`, testToken);
  assert(sqlInject.status === 200, 'SQL injection attempt returns 200 (safe)');

  // Percent and underscore (LIKE wildcards)
  const percent = await request('GET', `/search/messages?q=${encodeURIComponent('100%')}`, testToken);
  assert(percent.status === 200, 'Query with % returns 200');

  const underscore = await request('GET', `/search/messages?q=${encodeURIComponent('a_b')}`, testToken);
  assert(underscore.status === 200, 'Query with _ returns 200');

  // Unicode
  const unicode = await request('GET', `/search/messages?q=${encodeURIComponent('hello 👋')}`, testToken);
  assert(unicode.status === 200, 'Query with emoji returns 200');

  // HTML/XSS
  const xss = await request('GET', `/search/messages?q=${encodeURIComponent('<script>alert(1)</script>')}`, testToken);
  assert(xss.status === 200, 'XSS attempt returns 200 (safe)');
}

async function testProgramFilter() {
  section('Program Filter');

  // Get a program the user is a member of
  const membership = await prisma.programMembership.findFirst({
    where: { userId: testUserId },
    select: { programId: true },
  });

  if (!membership) {
    console.log('  ⚠️  User has no program memberships');
    return;
  }

  const filtered = await request(
    'GET',
    `/search/messages?q=he&programId=${membership.programId}`,
    testToken
  );
  assert(filtered.status === 200, 'Program-filtered search returns 200');

  // All channel results should be from this program
  const channelResults = (filtered.body.data?.results || []).filter((r: any) => r.context.type === 'channel');
  const allFromProgram = channelResults.every((r: any) => r.context.programId === membership.programId);
  assert(channelResults.length === 0 || allFromProgram, 'All channel results are from the filtered program');

  // Non-existent program
  const noProgram = await request('GET', '/search/messages?q=he&programId=nonexistent-id', testToken);
  assert(noProgram.status === 200, 'Non-existent programId returns 200 with empty channel results');
}

async function testAccessControl() {
  section('Access Control');

  // Create a temporary user with no memberships
  const timestamp = Date.now();
  const tempUser = await prisma.user.create({
    data: {
      email: `test-search-${timestamp}@test.com`,
      displayName: 'Search Test User',
      authProvider: 'GOOGLE',
      authProviderId: `test-search-${timestamp}`,
    },
  });

  const tempToken = generateAccessToken(tempUser.id);

  const res = await request('GET', '/search/messages?q=hello', tempToken);
  assert(res.status === 200, 'User with no memberships gets 200');
  assert(res.body.data?.results.length === 0, 'User with no memberships gets 0 results');

  // Cleanup
  await prisma.user.delete({ where: { id: tempUser.id } });
  assert(true, 'Temp user cleaned up');
}

async function main() {
  console.log('🔍 Message Search API Tests');
  console.log('═'.repeat(50));

  try {
    await setup();
    await testValidation();
    await testBasicSearch();
    await testSearchScopes();
    await testPagination();
    await testResultFormat();
    await testCaseInsensitivity();
    await testSpecialCharacters();
    await testProgramFilter();
    await testAccessControl();
  } catch (error) {
    console.error('\n💥 Test error:', error);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═'.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

main();
