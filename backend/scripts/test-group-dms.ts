/**
 * Test Script: Group DMs
 *
 * Tests all group DM backend functionality:
 * 1.  Create group conversation (3 participants, no name)
 * 2.  Create group conversation (with custom name)
 * 3.  Reject group with < 3 participants
 * 4.  Reject group with > 8 participants
 * 5.  Reject group with invalid name (too long)
 * 6.  GET /conversations returns proper group display name (custom name)
 * 7.  GET /conversations returns comma-separated names when no custom name
 * 8.  GET /conversations/:id returns group info
 * 9.  Rename group (PATCH)
 * 10. Clear group name (set to null/empty)
 * 11. Reject rename on 1:1 conversation
 * 12. Reject rename by non-participant
 * 13. Add participant to group
 * 14. Reject adding participant beyond max (8)
 * 15. Reject adding already-existing participant
 * 16. Reject adding to 1:1 conversation
 * 17. Reject adding by non-participant
 * 18. Leave group conversation
 * 19. Verify leaving user loses access
 * 20. Group deletes when last participant leaves
 * 21. 1:1 conversations still work (no regression)
 * 22. Allow duplicate groups with same participants
 * 23. Reject adding non-existent user
 *
 * Run: cd backend && npx ts-node scripts/test-group-dms.ts
 * Requires: Backend running on localhost:3000
 */

import { prisma } from '../src/config/database';
import http from 'http';

const BASE_URL = 'http://localhost:3000/api';

// ── HTTP helper ──

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

// ── Test runner ──

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

// ── JWT helper (generate test tokens directly) ──

import jwt from 'jsonwebtoken';
import { config } from '../src/config';

function makeToken(userId: string): string {
  return jwt.sign(
    { userId, type: 'access' },
    config.jwt.accessSecret,
    { expiresIn: '1h' }
  );
}

// ── Main test suite ──

async function main() {
  console.log('\n🧪 Group DM Tests\n');
  console.log('─'.repeat(50));

  // ── Setup: Create test users ──
  console.log('\n📦 Setting up test data...');

  const testUsers = [];
  for (let i = 1; i <= 10; i++) {
    const user = await prisma.user.upsert({
      where: { email: `groupdm-test-${i}@test.com` },
      update: { displayName: `GDM User ${i}` },
      create: {
        email: `groupdm-test-${i}@test.com`,
        displayName: `GDM User ${i}`,
        authProvider: 'GOOGLE',
        authProviderId: `gdm-test-${i}`,
      },
    });
    testUsers.push(user);
  }

  const [userA, userB, userC, userD, userE, userF, userG, userH, userI, userJ] = testUsers;
  const tokenA = makeToken(userA.id);
  const tokenB = makeToken(userB.id);
  const tokenC = makeToken(userC.id);
  const tokenD = makeToken(userD.id);
  const authA = { Authorization: `Bearer ${tokenA}` };
  const authB = { Authorization: `Bearer ${tokenB}` };
  const authC = { Authorization: `Bearer ${tokenC}` };
  const authD = { Authorization: `Bearer ${tokenD}` };

  // Cleanup any prior test conversations
  const priorConvos = await prisma.conversation.findMany({
    where: {
      participants: {
        some: { userId: { in: testUsers.map(u => u.id) } },
      },
    },
  });
  for (const c of priorConvos) {
    await prisma.conversation.delete({ where: { id: c.id } }).catch(() => {});
  }

  let groupId1: string = '';
  let groupId2: string = '';
  let oneToOneId: string = '';

  // ─────────────────────────────────────────
  // TEST 1: Create group (3 participants, no name)
  // ─────────────────────────────────────────
  console.log('\n📋 Group Creation');
  {
    const res = await request('POST', '/api/conversations', {
      participantIds: [userB.id, userC.id],
    }, authA);
    assert(res.status === 201, 'T1: Create group (3 participants, no name)', `status=${res.status}`);
    assert(res.data.data?.conversation?.isGroup === true, 'T1: isGroup is true');
    assert(res.data.data?.isExisting === false, 'T1: isExisting is false');
    groupId1 = res.data.data?.conversation?.id;
    // Name should be comma-separated (B, C from A's perspective)
    const name = res.data.data?.conversation?.name;
    assert(
      name?.includes('GDM User 2') && name?.includes('GDM User 3'),
      'T1: Display name contains other participants',
      `name="${name}"`
    );
    assert(res.data.data?.conversation?.createdById === userA.id, 'T1: createdById is set');
  }

  // ─────────────────────────────────────────
  // TEST 2: Create group with custom name
  // ─────────────────────────────────────────
  {
    const res = await request('POST', '/api/conversations', {
      participantIds: [userB.id, userC.id],
      name: 'Project Alpha',
    }, authA);
    assert(res.status === 201, 'T2: Create group with custom name');
    assert(res.data.data?.conversation?.groupName === 'Project Alpha', 'T2: groupName is "Project Alpha"');
    assert(res.data.data?.conversation?.name === 'Project Alpha', 'T2: display name is custom name');
    groupId2 = res.data.data?.conversation?.id;
  }

  // ─────────────────────────────────────────
  // TEST 3: Reject group with < 3 participants (only 1 other = 2 total = 1:1)
  // ─────────────────────────────────────────
  console.log('\n📋 Validation');
  {
    // This is actually a valid 1:1 conversation, not a group error
    // The real test is: can we force isGroup with only 2 people? No — it's determined by count.
    // With 2 unique IDs (self + 1 other) it creates a 1:1, not a group.
    const res = await request('POST', '/api/conversations', {
      participantIds: [userB.id],
    }, authA);
    // This should succeed as a 1:1
    assert(res.status === 200 || res.status === 201, 'T3: 2 participants creates 1:1 (not group)');
    if (res.data.data?.conversation) {
      assert(res.data.data.conversation.isGroup === false, 'T3: isGroup is false for 2 participants');
      oneToOneId = res.data.data.conversation.id;
    }
  }

  // ─────────────────────────────────────────
  // TEST 4: Reject group with > 8 participants
  // ─────────────────────────────────────────
  {
    const res = await request('POST', '/api/conversations', {
      participantIds: testUsers.slice(1).map(u => u.id), // 9 others + self = 10
    }, authA);
    assert(res.status === 400, 'T4: Reject > 8 participants', `status=${res.status}`);
  }

  // ─────────────────────────────────────────
  // TEST 5: Reject group with name > 100 chars
  // ─────────────────────────────────────────
  {
    const res = await request('POST', '/api/conversations', {
      participantIds: [userB.id, userC.id],
      name: 'A'.repeat(101),
    }, authA);
    assert(res.status === 400, 'T5: Reject name > 100 chars', `status=${res.status}`);
  }

  // ─────────────────────────────────────────
  // TEST 6: GET /conversations returns proper group display (custom name)
  // ─────────────────────────────────────────
  console.log('\n📋 List Conversations');
  {
    const res = await request('GET', '/api/conversations', undefined, authA);
    assert(res.status === 200, 'T6: GET /conversations succeeds');
    const convos = res.data.data?.conversations || [];
    const namedGroup = convos.find((c: any) => c.id === groupId2);
    assert(namedGroup?.name === 'Project Alpha', 'T6: Named group displays custom name', `name="${namedGroup?.name}"`);
    assert(namedGroup?.groupName === 'Project Alpha', 'T6: groupName field present');
  }

  // ─────────────────────────────────────────
  // TEST 7: GET /conversations returns comma-separated when no name
  // ─────────────────────────────────────────
  {
    const res = await request('GET', '/api/conversations', undefined, authA);
    const convos = res.data.data?.conversations || [];
    const unnamedGroup = convos.find((c: any) => c.id === groupId1);
    const name = unnamedGroup?.name || '';
    assert(
      name.includes('GDM User 2') && name.includes('GDM User 3'),
      'T7: Unnamed group shows comma-separated names',
      `name="${name}"`
    );
  }

  // ─────────────────────────────────────────
  // TEST 8: GET /conversations/:id returns group info
  // ─────────────────────────────────────────
  console.log('\n📋 Get Single Conversation');
  {
    const res = await request('GET', `/api/conversations/${groupId2}`, undefined, authA);
    assert(res.status === 200, 'T8: GET single group conversation');
    assert(res.data.data?.conversation?.isGroup === true, 'T8: isGroup is true');
    assert(res.data.data?.conversation?.groupName === 'Project Alpha', 'T8: groupName present');
    assert(res.data.data?.conversation?.createdById === userA.id, 'T8: createdById present');
    assert(res.data.data?.conversation?.participants?.length === 3, 'T8: 3 participants', `count=${res.data.data?.conversation?.participants?.length}`);
  }

  // ─────────────────────────────────────────
  // TEST 9: Rename group (PATCH)
  // ─────────────────────────────────────────
  console.log('\n📋 Rename Group');
  {
    const res = await request('PATCH', `/api/conversations/${groupId1}`, {
      name: 'Team Beta',
    }, authA);
    assert(res.status === 200, 'T9: Rename group succeeds');
    assert(res.data.data?.conversation?.groupName === 'Team Beta', 'T9: groupName updated', `groupName="${res.data.data?.conversation?.groupName}"`);
    assert(res.data.data?.conversation?.name === 'Team Beta', 'T9: display name uses custom name');
  }

  // ─────────────────────────────────────────
  // TEST 10: Clear group name
  // ─────────────────────────────────────────
  {
    const res = await request('PATCH', `/api/conversations/${groupId1}`, {
      name: '',
    }, authA);
    assert(res.status === 200, 'T10: Clear group name succeeds');
    assert(res.data.data?.conversation?.groupName === null, 'T10: groupName is null', `groupName=${res.data.data?.conversation?.groupName}`);
    const displayName = res.data.data?.conversation?.name || '';
    assert(
      displayName.includes('GDM User 2') && displayName.includes('GDM User 3'),
      'T10: Display name reverts to comma-separated',
      `name="${displayName}"`
    );
  }

  // ─────────────────────────────────────────
  // TEST 11: Reject rename on 1:1
  // ─────────────────────────────────────────
  {
    const res = await request('PATCH', `/api/conversations/${oneToOneId}`, {
      name: 'Nope',
    }, authA);
    assert(res.status === 400, 'T11: Reject rename on 1:1', `status=${res.status}`);
  }

  // ─────────────────────────────────────────
  // TEST 12: Reject rename by non-participant
  // ─────────────────────────────────────────
  {
    const res = await request('PATCH', `/api/conversations/${groupId1}`, {
      name: 'Hacked',
    }, authD);
    assert(res.status === 403, 'T12: Reject rename by non-participant', `status=${res.status}`);
  }

  // ─────────────────────────────────────────
  // TEST 13: Add participant to group
  // ─────────────────────────────────────────
  console.log('\n📋 Add Participants');
  {
    const res = await request('POST', `/api/conversations/${groupId1}/participants`, {
      userIds: [userD.id],
    }, authA);
    assert(res.status === 200, 'T13: Add participant succeeds');
    assert(res.data.data?.conversation?.participants?.length === 4, 'T13: Now 4 participants', `count=${res.data.data?.conversation?.participants?.length}`);
    assert(
      res.data.data?.addedUsers?.some((u: any) => u.userId === userD.id),
      'T13: addedUsers contains new user'
    );
  }

  // ─────────────────────────────────────────
  // TEST 14: Reject adding beyond max (8)
  // ─────────────────────────────────────────
  {
    // groupId1 now has 4. Add 5 more to hit 9 (over 8 max)
    const res = await request('POST', `/api/conversations/${groupId1}/participants`, {
      userIds: [userE.id, userF.id, userG.id, userH.id, userI.id],
    }, authA);
    assert(res.status === 400, 'T14: Reject adding beyond max 8', `status=${res.status}`);
  }

  // ─────────────────────────────────────────
  // TEST 15: Reject adding already-existing participant
  // ─────────────────────────────────────────
  {
    const res = await request('POST', `/api/conversations/${groupId1}/participants`, {
      userIds: [userB.id],
    }, authA);
    assert(res.status === 400, 'T15: Reject adding existing participant', `status=${res.status}`);
  }

  // ─────────────────────────────────────────
  // TEST 16: Reject adding to 1:1 conversation
  // ─────────────────────────────────────────
  {
    const res = await request('POST', `/api/conversations/${oneToOneId}/participants`, {
      userIds: [userC.id],
    }, authA);
    assert(res.status === 400, 'T16: Reject adding to 1:1', `status=${res.status}`);
  }

  // ─────────────────────────────────────────
  // TEST 17: Reject adding by non-participant
  // ─────────────────────────────────────────
  {
    const tokenE = makeToken(userE.id);
    const res = await request('POST', `/api/conversations/${groupId1}/participants`, {
      userIds: [userF.id],
    }, { Authorization: `Bearer ${tokenE}` });
    assert(res.status === 403, 'T17: Reject adding by non-participant', `status=${res.status}`);
  }

  // ─────────────────────────────────────────
  // TEST 18: Leave group conversation
  // ─────────────────────────────────────────
  console.log('\n📋 Leave Group');
  {
    const res = await request('DELETE', `/api/conversations/${groupId1}`, undefined, authD);
    assert(res.status === 200, 'T18: Leave group succeeds');
    assert(res.data.message === 'Left the conversation', 'T18: Response says "Left the conversation"');
  }

  // ─────────────────────────────────────────
  // TEST 19: Verify leaving user loses access
  // ─────────────────────────────────────────
  {
    const res = await request('GET', `/api/conversations/${groupId1}`, undefined, authD);
    assert(res.status === 403, 'T19: Left user cannot access conversation', `status=${res.status}`);
  }

  // ─────────────────────────────────────────
  // TEST 20: Group deletes when last participant leaves
  // ─────────────────────────────────────────
  {
    // Create a tiny group (A, B, C), have all 3 leave
    const createRes = await request('POST', '/api/conversations', {
      participantIds: [userB.id, userC.id],
      name: 'Ephemeral Group',
    }, authA);
    const ephemeralId = createRes.data.data?.conversation?.id;

    await request('DELETE', `/api/conversations/${ephemeralId}`, undefined, authA);
    await request('DELETE', `/api/conversations/${ephemeralId}`, undefined, authB);
    await request('DELETE', `/api/conversations/${ephemeralId}`, undefined, authC);

    // Verify conversation is deleted
    if (!ephemeralId) {
      assert(false, 'T20: Conversation deleted when all participants leave (skipped - create failed)');
    }
    const conv = ephemeralId ? await prisma.conversation.findUnique({ where: { id: ephemeralId } }) : 'skip';
    if (ephemeralId) {
      assert(conv === null, 'T20: Conversation deleted when all participants leave');
    }
  }

  // ─────────────────────────────────────────
  // TEST 21: 1:1 conversations still work (regression)
  // ─────────────────────────────────────────
  console.log('\n📋 Regression: 1:1 Still Works');
  {
    // Create a fresh 1:1
    const res = await request('POST', '/api/conversations', {
      participantIds: [userC.id],
    }, authA);
    assert(res.status === 200 || res.status === 201, 'T21: 1:1 creation still works');
    const conv = res.data.data?.conversation;
    assert(conv?.isGroup === false, 'T21: isGroup is false');
    assert(conv?.name === 'GDM User 3', 'T21: Display name is other user', `name="${conv?.name}"`);
  }

  // ─────────────────────────────────────────
  // TEST 22: Allow duplicate groups with same participants
  // ─────────────────────────────────────────
  {
    const res1 = await request('POST', '/api/conversations', {
      participantIds: [userB.id, userC.id],
      name: 'Group Dup 1',
    }, authA);
    const res2 = await request('POST', '/api/conversations', {
      participantIds: [userB.id, userC.id],
      name: 'Group Dup 2',
    }, authA);
    assert(res1.status === 201 && res2.status === 201, 'T22: Duplicate groups allowed');
    assert(
      res1.data.data?.conversation?.id !== res2.data.data?.conversation?.id,
      'T22: Different conversation IDs'
    );
  }

  // ─────────────────────────────────────────
  // TEST 23: Reject adding non-existent user
  // ─────────────────────────────────────────
  {
    const res = await request('POST', `/api/conversations/${groupId1}/participants`, {
      userIds: ['non-existent-user-id'],
    }, authA);
    assert(res.status === 400, 'T23: Reject adding non-existent user', `status=${res.status}`);
  }

  // ── Cleanup ──
  console.log('\n📦 Cleaning up test data...');
  const testConvos = await prisma.conversation.findMany({
    where: {
      participants: {
        some: { userId: { in: testUsers.map(u => u.id) } },
      },
    },
  });
  for (const c of testConvos) {
    await prisma.conversation.delete({ where: { id: c.id } }).catch(() => {});
  }
  for (const u of testUsers) {
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }

  // ── Summary ──
  console.log('\n' + '─'.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${passed + failed} total)\n`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
