/**
 * Test script for Push Notification Deep Linking
 * 
 * This tests the notification data payloads from the backend
 * to verify they contain all required fields for deep linking
 * on the mobile side.
 * 
 * Run: npx tsx scripts/test-deep-linking.ts
 */

import {
  buildChannelMessageNotification,
  buildDMNotification,
  buildMentionNotification,
  buildProgramInviteNotification,
} from '../src/services/pushNotification';

let passed = 0;
let failed = 0;

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

// ============================================
// TEST 1: Channel Message Notification Payload
// ============================================
section('Channel Message Notification - Deep Link Data');

const channelMsg = buildChannelMessageNotification({
  authorName: 'Alice',
  channelName: 'general',
  programName: 'Summer 2026',
  messagePreview: 'Hello everyone!',
  channelId: 'ch-123',
  programId: 'prog-456',
});

assert(channelMsg.data.type === 'channel_message', 'type is "channel_message"');
assert(channelMsg.data.channelId === 'ch-123', 'channelId is present');
assert(channelMsg.data.programId === 'prog-456', 'programId is present');
assert(channelMsg.data.channelName === 'general', 'channelName is present');
assert(typeof channelMsg.title === 'string' && channelMsg.title.length > 0, 'title is non-empty');
assert(typeof channelMsg.body === 'string' && channelMsg.body.length > 0, 'body is non-empty');
assert(channelMsg.sound === 'default', 'sound is default');

// ============================================
// TEST 2: DM Notification Payload
// ============================================
section('DM Notification - Deep Link Data');

const dmMsg = buildDMNotification({
  authorName: 'Bob',
  messagePreview: 'Hey, how are you?',
  conversationId: 'conv-789',
});

assert(dmMsg.data.type === 'dm_message', 'type is "dm_message"');
assert(dmMsg.data.conversationId === 'conv-789', 'conversationId is present');
assert(dmMsg.data.authorName === 'Bob', 'authorName is present for DM title');
assert(!dmMsg.data.channelId, 'channelId should NOT be present in DM');
assert(!dmMsg.data.programId, 'programId should NOT be present in DM');

// ============================================
// TEST 3: Mention Notification Payload
// ============================================
section('Mention Notification - Deep Link Data');

const mentionMsg = buildMentionNotification({
  authorName: 'Charlie',
  channelName: 'dev-chat',
  programName: 'Fall 2026',
  messagePreview: '@user check this out',
  channelId: 'ch-mention-1',
  programId: 'prog-mention-2',
  mentionType: 'user',
});

assert(mentionMsg.data.type === 'mention', 'type is "mention"');
assert(mentionMsg.data.channelId === 'ch-mention-1', 'channelId is present');
assert(mentionMsg.data.programId === 'prog-mention-2', 'programId is present');
assert(mentionMsg.data.channelName === 'dev-chat', 'channelName is present');

// Test @everyone mention
const everyoneMention = buildMentionNotification({
  authorName: 'Admin',
  channelName: 'announcements',
  programName: 'Global',
  messagePreview: '@everyone important update',
  channelId: 'ch-ann',
  programId: 'prog-glob',
  mentionType: 'everyone',
});

assert(everyoneMention.data.type === 'mention', '@everyone mention type is "mention"');
assert(everyoneMention.body.includes('@everyone'), '@everyone mention body includes @everyone');

// ============================================
// TEST 4: Program Invite Notification Payload
// ============================================
section('Program Invite Notification - Deep Link Data');

const inviteMsg = buildProgramInviteNotification({
  inviterName: 'Diana',
  programName: 'Spring 2026',
  programId: 'prog-invite-1',
});

assert(inviteMsg.data.type === 'program_invite', 'type is "program_invite"');
assert(inviteMsg.data.programId === 'prog-invite-1', 'programId is present');
assert(!inviteMsg.data.channelId, 'channelId should NOT be present in invite');
assert(!inviteMsg.data.conversationId, 'conversationId should NOT be present in invite');

// ============================================
// TEST 5: Edge Cases - Empty/Missing Fields
// ============================================
section('Edge Cases - Empty & Special Characters');

// Long channel name
const longName = buildChannelMessageNotification({
  authorName: 'Eve',
  channelName: 'this-is-a-very-long-channel-name-that-might-cause-issues',
  programName: 'Test',
  messagePreview: 'Test message',
  channelId: 'ch-long',
  programId: 'prog-long',
});
assert(
  longName.data.channelName === 'this-is-a-very-long-channel-name-that-might-cause-issues',
  'Long channel name is preserved in data'
);

// Special characters in names
const specialChars = buildDMNotification({
  authorName: "O'Brien & Co.",
  messagePreview: 'Test with <html> & "quotes"',
  conversationId: 'conv-special',
});
assert(specialChars.data.authorName === "O'Brien & Co.", 'Special characters preserved in authorName');

// Empty message preview
const emptyPreview = buildChannelMessageNotification({
  authorName: 'Frank',
  channelName: 'test',
  programName: 'Test',
  messagePreview: '',
  channelId: 'ch-empty',
  programId: 'prog-empty',
});
assert(typeof emptyPreview.body === 'string', 'Empty preview produces valid body');
assert(emptyPreview.data.channelId === 'ch-empty', 'Data is still valid with empty preview');

// Unicode characters
const unicode = buildDMNotification({
  authorName: '田中太郎',
  messagePreview: 'こんにちは 👋',
  conversationId: 'conv-unicode',
});
assert(unicode.data.authorName === '田中太郎', 'Unicode authorName preserved');
assert(unicode.data.conversationId === 'conv-unicode', 'conversationId valid with unicode content');

// ============================================
// TEST 6: Thread IDs for Notification Grouping
// ============================================
section('Thread IDs for Notification Grouping');

assert(channelMsg.threadId === 'channel:ch-123', 'Channel message has correct threadId');
assert(dmMsg.threadId === 'conversation:conv-789', 'DM has correct threadId');
assert(mentionMsg.threadId === 'channel:ch-mention-1', 'Mention has correct threadId');
assert(!inviteMsg.threadId, 'Program invite has no threadId (no grouping needed)');

// ============================================
// TEST 7: Category IDs for Notification Actions
// ============================================
section('Category IDs');

assert(channelMsg.categoryId === 'channel_message', 'Channel message categoryId correct');
assert(dmMsg.categoryId === 'dm_message', 'DM categoryId correct');
assert(mentionMsg.categoryId === 'mention', 'Mention categoryId correct');
assert(inviteMsg.categoryId === 'program_invite', 'Invite categoryId correct');

// ============================================
// DEEP LINK ROUTING VALIDATION
// ============================================
section('Deep Link Routing Validation');

// Simulate what the mobile app does with notification data
type NotificationType = 'channel_message' | 'dm_message' | 'mention' | 'program_invite';

function simulateDeepLink(data: Record<string, any>): string | null {
  const type = data.type as NotificationType;
  switch (type) {
    case 'channel_message':
    case 'mention':
      if (data.channelId && data.programId) {
        return `Channel(${data.channelId}, ${data.channelName}, ${data.programId})`;
      }
      return null;
    case 'dm_message':
      if (data.conversationId) {
        return `Conversation(${data.conversationId}, ${data.authorName})`;
      }
      return null;
    case 'program_invite':
      if (data.programId) {
        return `ProgramDetail(${data.programId})`;
      }
      return null;
    default:
      return null;
  }
}

const channelRoute = simulateDeepLink(channelMsg.data);
assert(channelRoute !== null, 'Channel message data produces valid route');
assert(channelRoute!.includes('ch-123'), 'Channel route contains channelId');

const dmRoute = simulateDeepLink(dmMsg.data);
assert(dmRoute !== null, 'DM data produces valid route');
assert(dmRoute!.includes('conv-789'), 'DM route contains conversationId');

const mentionRoute = simulateDeepLink(mentionMsg.data);
assert(mentionRoute !== null, 'Mention data produces valid route');
assert(mentionRoute!.includes('ch-mention-1'), 'Mention route contains channelId');

const inviteRoute = simulateDeepLink(inviteMsg.data);
assert(inviteRoute !== null, 'Invite data produces valid route');
assert(inviteRoute!.includes('prog-invite-1'), 'Invite route contains programId');

// Test with missing data
const missingData = simulateDeepLink({ type: 'channel_message' });
assert(missingData === null, 'Missing channelId/programId returns null');

const missingDM = simulateDeepLink({ type: 'dm_message' });
assert(missingDM === null, 'Missing conversationId returns null');

const unknownType = simulateDeepLink({ type: 'unknown_type' });
assert(unknownType === null, 'Unknown type returns null');

// ============================================
// SUMMARY
// ============================================
console.log('\n' + '═'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('═'.repeat(50));

if (failed > 0) {
  process.exit(1);
}
