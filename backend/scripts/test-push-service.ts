/**
 * Test script for the Push Notification Service
 * 
 * Exercises all service functions:
 * 1. Notification payload builders (unit tests)
 * 2. Token validation and lookup
 * 3. Sending to Expo API (with a test token — will get DeviceNotRegistered)
 * 4. Token cleanup
 * 
 * Usage: cd backend && npx ts-node scripts/test-push-service.ts
 */

import { prisma } from '../src/config/database';
import {
  sendPushToUsers,
  sendPushToTokens,
  buildChannelMessageNotification,
  buildDMNotification,
  buildMentionNotification,
  buildProgramInviteNotification,
  getUserTokenCount,
} from '../src/services/pushNotification';

async function main() {
  console.log('======================================');
  console.log('  Push Notification Service Tests');
  console.log('======================================\n');

  let passed = 0;
  let failed = 0;

  function assert(label: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  // -----------------------------------
  // TEST GROUP 1: Notification Builders
  // -----------------------------------
  console.log('\n--- 1. Notification Builders ---\n');

  const channelNotif = buildChannelMessageNotification({
    authorName: 'Alice',
    channelName: 'general',
    programName: 'Test Program',
    messagePreview: 'Hello everyone!',
    channelId: 'ch-1',
    programId: 'pg-1',
  });
  assert('Channel notification title', channelNotif.title === '#general in Test Program');
  assert('Channel notification body', channelNotif.body === 'Alice: Hello everyone!');
  assert('Channel notification data.type', channelNotif.data?.type === 'channel_message');
  assert('Channel notification data.channelId', channelNotif.data?.channelId === 'ch-1');
  assert('Channel notification threadId', channelNotif.threadId === 'channel:ch-1');

  const dmNotif = buildDMNotification({
    authorName: 'Bob',
    messagePreview: 'Hey, how are you?',
    conversationId: 'conv-1',
  });
  assert('DM notification title', dmNotif.title === 'Bob');
  assert('DM notification body', dmNotif.body === 'Hey, how are you?');
  assert('DM notification data.type', dmNotif.data?.type === 'dm_message');
  assert('DM notification data.conversationId', dmNotif.data?.conversationId === 'conv-1');

  const mentionNotif = buildMentionNotification({
    authorName: 'Carol',
    channelName: 'announcements',
    programName: 'Internship 2026',
    messagePreview: '@everyone please check in',
    channelId: 'ch-2',
    programId: 'pg-2',
    mentionType: 'everyone',
  });
  assert('Mention notification title', mentionNotif.title === '#announcements in Internship 2026');
  assert('Mention notification body includes @everyone', mentionNotif.body.includes('@everyone'));

  const userMentionNotif = buildMentionNotification({
    authorName: 'Dave',
    channelName: 'general',
    programName: 'Test',
    messagePreview: 'Check this out',
    channelId: 'ch-3',
    programId: 'pg-3',
    mentionType: 'user',
  });
  assert('User mention says "you were"', userMentionNotif.body.includes('you were'));

  const roleMentionNotif = buildMentionNotification({
    authorName: 'Eve',
    channelName: 'general',
    programName: 'Test',
    messagePreview: 'Attention',
    channelId: 'ch-4',
    programId: 'pg-4',
    mentionType: 'role',
  });
  assert('Role mention says "your role was"', roleMentionNotif.body.includes('your role was'));

  const inviteNotif = buildProgramInviteNotification({
    inviterName: 'Frank',
    programName: 'New Research Group',
    programId: 'pg-5',
  });
  assert('Invite notification title', inviteNotif.title === 'Program Invitation');
  assert('Invite notification body', inviteNotif.body.includes('Frank') && inviteNotif.body.includes('New Research Group'));

  // Test truncation with long message
  const longMsg = 'A'.repeat(200);
  const longNotif = buildChannelMessageNotification({
    authorName: 'X',
    channelName: 'ch',
    programName: 'P',
    messagePreview: longMsg,
    channelId: 'ch-x',
    programId: 'pg-x',
  });
  assert('Long message truncated', longNotif.body.length <= 110); // "X: " + 100 chars + "..."
  assert('Long message ends with ...', longNotif.body.endsWith('...'));

  // Test markdown stripping
  const mdNotif = buildChannelMessageNotification({
    authorName: 'Y',
    channelName: 'ch',
    programName: 'P',
    messagePreview: '**bold** and *italic* and `code`',
    channelId: 'ch-y',
    programId: 'pg-y',
  });
  assert('Markdown stripped from body', mdNotif.body === 'Y: bold and italic and code');

  // -----------------------------------
  // TEST GROUP 2: Empty inputs
  // -----------------------------------
  console.log('\n--- 2. Edge Cases: Empty Inputs ---\n');

  const emptyResult = await sendPushToUsers([], channelNotif);
  assert('Empty userIds returns 0 sent', emptyResult.sent === 0);
  assert('Empty userIds returns 0 failed', emptyResult.failed === 0);

  const emptyTokenResult = await sendPushToTokens([], channelNotif);
  assert('Empty tokens returns 0 sent', emptyTokenResult.sent === 0);

  // -----------------------------------
  // TEST GROUP 3: User with no tokens
  // -----------------------------------
  console.log('\n--- 3. User With No Push Tokens ---\n');

  const firstUser = await prisma.user.findFirst();
  if (firstUser) {
    // Make sure user has no tokens first
    await prisma.pushToken.deleteMany({ where: { userId: firstUser.id } });
    
    const noTokenResult = await sendPushToUsers([firstUser.id], channelNotif);
    assert('User with no tokens: sent = 0', noTokenResult.sent === 0);
    assert('User with no tokens: skipped > 0', noTokenResult.skipped > 0);

    const tokenCount = await getUserTokenCount(firstUser.id);
    assert('getUserTokenCount returns 0', tokenCount === 0);
  } else {
    console.log('  ⚠️  No users found in database — skipping user tests');
  }

  // -----------------------------------
  // TEST GROUP 4: Exclude author
  // -----------------------------------
  console.log('\n--- 4. Exclude Author ---\n');

  if (firstUser) {
    const excludeResult = await sendPushToUsers(
      [firstUser.id],
      channelNotif,
      { excludeUserId: firstUser.id }
    );
    assert('Excluding only user: sent = 0', excludeResult.sent === 0);
    assert('Excluding only user: skipped = 0', excludeResult.skipped === 0);
  }

  // -----------------------------------
  // TEST GROUP 5: Send with test token (will hit Expo API)
  // -----------------------------------
  console.log('\n--- 5. Send to Expo API (test token) ---\n');

  if (firstUser) {
    // Insert a test token (valid format but won't actually deliver)
    const testToken = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
    await prisma.pushToken.upsert({
      where: { token: testToken },
      create: { userId: firstUser.id, token: testToken, platform: 'ios' },
      update: { userId: firstUser.id },
    });

    const tokenCountAfter = await getUserTokenCount(firstUser.id);
    assert('Test token registered', tokenCountAfter >= 1);

    // Send — this will hit Expo API. The test token will likely get
    // DeviceNotRegistered or similar error, which exercises error handling.
    const sendResult = await sendPushToUsers([firstUser.id], channelNotif);
    console.log(`    → Expo API response: sent=${sendResult.sent}, failed=${sendResult.failed}`);
    
    // Either outcome is valid: sent=1 (Expo accepted it) or failed=1 (invalid device)
    assert(
      'Expo API processed the request',
      sendResult.sent + sendResult.failed === 1,
      `sent=${sendResult.sent}, failed=${sendResult.failed}`
    );

    // Clean up test token
    await prisma.pushToken.deleteMany({ where: { token: testToken } });
  }

  // -----------------------------------
  // TEST GROUP 6: Invalid tokens via sendPushToTokens
  // -----------------------------------
  console.log('\n--- 6. Invalid Token Handling ---\n');

  const invalidResult = await sendPushToTokens(['not-a-valid-token'], channelNotif);
  assert('Invalid token: sent = 0', invalidResult.sent === 0);
  assert('Invalid token: failed = 1', invalidResult.failed === 1);

  // -----------------------------------
  // SUMMARY
  // -----------------------------------
  console.log('\n======================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('======================================\n');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Test script failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
