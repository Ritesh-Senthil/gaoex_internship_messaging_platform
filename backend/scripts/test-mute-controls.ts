/**
 * Test Script: Mute Controls
 * 
 * Tests the mute toggle API endpoints and verifies mute state
 * is correctly returned in list responses.
 * 
 * 1. Channel mute toggle
 * 2. Channel mute status GET
 * 3. Channel mute state in program detail response (isMuted field)
 * 4. Conversation mute toggle
 * 5. Conversation mute status GET
 * 6. Conversation mute state in conversation list response
 * 7. Toggle behavior (flip current state)
 * 8. Explicit set (muted=true/false)
 * 9. Mute non-existent channel (error handling)
 */

import { prisma } from '../src/config/database';
import http from 'http';
import { generateAccessToken } from '../src/utils/jwt';

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

async function main() {
  console.log('\n🧪 Mute Controls Tests\n');
  console.log('='.repeat(50));

  // Get a test user
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('❌ Need at least 1 user in the database');
    process.exit(1);
  }
  const token = generateAccessToken(user.id);
  const headers = { Authorization: `Bearer ${token}` };

  // Find a channel the user has access to
  const membership = await prisma.programMembership.findFirst({
    where: { userId: user.id },
    include: {
      program: {
        include: {
          channels: { take: 1 },
        },
      },
    },
  });

  if (!membership || membership.program.channels.length === 0) {
    console.log('❌ User needs to be in a program with at least 1 channel');
    process.exit(1);
  }

  const channel = membership.program.channels[0];
  const programId = membership.programId;

  // Find a conversation for the user
  const participant = await prisma.conversationParticipant.findFirst({
    where: { userId: user.id },
    include: { conversation: true },
  });

  // -------------------------------------------
  // CHANNEL MUTE TESTS
  // -------------------------------------------

  // Ensure channel starts unmuted
  await prisma.channelRead.upsert({
    where: { userId_channelId: { userId: user.id, channelId: channel.id } },
    create: { userId: user.id, channelId: channel.id, lastReadAt: new Date(), isMuted: false },
    update: { isMuted: false },
  });

  // Test 1: Get channel mute status (should be false)
  console.log('\n📋 Test 1: Get channel mute status');
  try {
    const res = await request('GET', `/api/channels/${channel.id}/mute`, undefined, headers);
    assert(res.status === 200, 'Returns 200');
    assert(res.data.data.isMuted === false, 'Channel is not muted initially');
  } catch (err: any) {
    assert(false, 'Get mute status', err.message);
  }

  // Test 2: Toggle mute (should become muted)
  console.log('\n📋 Test 2: Toggle channel mute ON');
  try {
    const res = await request('POST', `/api/channels/${channel.id}/mute`, {}, headers);
    assert(res.status === 200, 'Returns 200');
    assert(res.data.data.isMuted === true, 'Channel is now muted');
  } catch (err: any) {
    assert(false, 'Toggle mute ON', err.message);
  }

  // Test 3: Verify mute status persisted
  console.log('\n📋 Test 3: Verify channel mute persisted');
  try {
    const res = await request('GET', `/api/channels/${channel.id}/mute`, undefined, headers);
    assert(res.data.data.isMuted === true, 'Mute status persisted as true');
  } catch (err: any) {
    assert(false, 'Verify mute persisted', err.message);
  }

  // Test 4: Toggle mute back (should become unmuted)
  console.log('\n📋 Test 4: Toggle channel mute OFF');
  try {
    const res = await request('POST', `/api/channels/${channel.id}/mute`, {}, headers);
    assert(res.data.data.isMuted === false, 'Channel is now unmuted');
  } catch (err: any) {
    assert(false, 'Toggle mute OFF', err.message);
  }

  // Test 5: Explicit set muted=true
  console.log('\n📋 Test 5: Explicit set muted=true');
  try {
    const res = await request('POST', `/api/channels/${channel.id}/mute`, { muted: true }, headers);
    assert(res.data.data.isMuted === true, 'Explicitly set to muted');
  } catch (err: any) {
    assert(false, 'Explicit mute=true', err.message);
  }

  // Test 6: Explicit set muted=false
  console.log('\n📋 Test 6: Explicit set muted=false');
  try {
    const res = await request('POST', `/api/channels/${channel.id}/mute`, { muted: false }, headers);
    assert(res.data.data.isMuted === false, 'Explicitly set to unmuted');
  } catch (err: any) {
    assert(false, 'Explicit mute=false', err.message);
  }

  // Test 7: isMuted in program detail response
  console.log('\n📋 Test 7: isMuted field in program detail response');
  try {
    // Mute the channel first
    await request('POST', `/api/channels/${channel.id}/mute`, { muted: true }, headers);

    const res = await request('GET', `/api/programs/${programId}`, undefined, headers);
    assert(res.status === 200, 'Program detail returns 200');

    // Find the channel in categories or uncategorized channels
    let foundChannel: any = null;
    if (res.data.data.program.categories) {
      for (const cat of res.data.data.program.categories) {
        const ch = cat.channels?.find((c: any) => c.id === channel.id);
        if (ch) { foundChannel = ch; break; }
      }
    }
    if (!foundChannel && res.data.data.program.channels) {
      foundChannel = res.data.data.program.channels.find((c: any) => c.id === channel.id);
    }

    assert(foundChannel !== null, 'Channel found in program detail');
    assert(foundChannel?.isMuted === true, 'isMuted=true in program detail response');

    // Unmute it
    await request('POST', `/api/channels/${channel.id}/mute`, { muted: false }, headers);
  } catch (err: any) {
    assert(false, 'isMuted in program detail', err.message);
  }

  // Test 8: isMuted in channel unread response
  console.log('\n📋 Test 8: isMuted in channel unread response');
  try {
    await request('POST', `/api/channels/${channel.id}/mute`, { muted: true }, headers);
    const res = await request('GET', `/api/channels/${channel.id}/unread`, undefined, headers);
    assert(res.data.data.isMuted === true, 'isMuted included in unread response');
    await request('POST', `/api/channels/${channel.id}/mute`, { muted: false }, headers);
  } catch (err: any) {
    assert(false, 'isMuted in unread', err.message);
  }

  // -------------------------------------------
  // CONVERSATION MUTE TESTS
  // -------------------------------------------

  if (participant) {
    const convId = participant.conversationId;

    // Ensure conversation starts unmuted
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { isMuted: false },
    });

    // Test 9: Get conversation mute status
    console.log('\n📋 Test 9: Get conversation mute status');
    try {
      const res = await request('GET', `/api/conversations/${convId}/mute`, undefined, headers);
      assert(res.status === 200, 'Returns 200');
      assert(res.data.data.isMuted === false, 'Conversation is not muted initially');
    } catch (err: any) {
      assert(false, 'Get conversation mute', err.message);
    }

    // Test 10: Toggle conversation mute ON
    console.log('\n📋 Test 10: Toggle conversation mute ON');
    try {
      const res = await request('POST', `/api/conversations/${convId}/mute`, {}, headers);
      assert(res.data.data.isMuted === true, 'Conversation is now muted');
    } catch (err: any) {
      assert(false, 'Toggle conversation mute ON', err.message);
    }

    // Test 11: Verify in conversations list response
    console.log('\n📋 Test 11: isMuted in conversations list');
    try {
      const res = await request('GET', '/api/conversations', undefined, headers);
      const conv = res.data.data.conversations.find((c: any) => c.id === convId);
      assert(conv !== undefined, 'Conversation found in list');
      assert(conv?.isMuted === true, 'isMuted=true in conversations list');
    } catch (err: any) {
      assert(false, 'isMuted in conversations list', err.message);
    }

    // Test 12: Toggle back OFF
    console.log('\n📋 Test 12: Toggle conversation mute OFF');
    try {
      const res = await request('POST', `/api/conversations/${convId}/mute`, {}, headers);
      assert(res.data.data.isMuted === false, 'Conversation is now unmuted');
    } catch (err: any) {
      assert(false, 'Toggle conversation mute OFF', err.message);
    }

    // Clean up
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { isMuted: false },
    });
  } else {
    console.log('\n⚠️  Skipping conversation mute tests (no conversations found for user)');
  }

  // -------------------------------------------
  // EDGE CASES
  // -------------------------------------------

  // Test 13: Mute non-existent channel
  console.log('\n📋 Test 13: Mute non-existent channel');
  try {
    const res = await request('POST', '/api/channels/non-existent-id/mute', {}, headers);
    assert(res.status >= 400, `Returns error status (got ${res.status})`);
  } catch (err: any) {
    assert(false, 'Non-existent channel mute', err.message);
  }

  // Test 14: Unauthenticated mute request
  console.log('\n📋 Test 14: Unauthenticated mute request');
  try {
    const res = await request('POST', `/api/channels/${channel.id}/mute`, {});
    assert(res.status === 401, 'Returns 401 for unauthenticated');
  } catch (err: any) {
    assert(false, 'Unauthenticated mute', err.message);
  }

  // Clean up channel mute state
  await prisma.channelRead.updateMany({
    where: { userId: user.id, channelId: channel.id },
    data: { isMuted: false },
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
