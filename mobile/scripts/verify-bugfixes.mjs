/**
 * Automated checks for beta bugfix utilities (run: node mobile/scripts/verify-bugfixes.mjs)
 */

function shouldIgnoreStalePostSendChange(sentText, incomingText, controlledValue) {
  if (controlledValue !== '') return false;
  if (incomingText === '') return true;
  if (incomingText === sentText) return true;
  if (sentText && incomingText.toLowerCase() === sentText.toLowerCase()) return true;
  if (incomingText.length > 1) {
    if (sentText && (incomingText.startsWith(sentText) || sentText.startsWith(incomingText))) {
      return true;
    }
  }
  return false;
}

function applyProfileUpdateToConversation(conv, data, currentUserId) {
  const hasParticipant = conv.participants.some(p => p.userId === data.userId);
  if (!hasParticipant) return conv;

  const participants = conv.participants.map(p =>
    p.userId === data.userId
      ? {
          ...p,
          displayName: data.displayName ?? p.displayName,
          avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : p.avatarUrl,
        }
      : p,
  );

  const patch = { participants };

  if (!conv.isGroup && data.userId !== currentUserId) {
    patch.name = data.displayName ?? conv.name;
    patch.avatarUrl = data.avatarUrl !== undefined ? data.avatarUrl : conv.avatarUrl;
  }

  return { ...conv, ...patch };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- messageInputGuard ---
assert(
  shouldIgnoreStalePostSendChange('hello', 'hello', '') === true,
  'ignore exact replay after send',
);
assert(
  shouldIgnoreStalePostSendChange('hello', 'Hello', '') === true,
  'ignore case-insensitive replay',
);
assert(
  shouldIgnoreStalePostSendChange('hello', 'w', '') === false,
  'accept first new keystroke',
);
assert(
  shouldIgnoreStalePostSendChange('hello there', 'hello there', '') === true,
  'ignore full stale replay of longer message',
);
assert(
  shouldIgnoreStalePostSendChange('hello', 'h', '') === false,
  'accept single char even if it matches prefix of sent text',
);
assert(
  shouldIgnoreStalePostSendChange('hello', 'he', '') === true,
  'ignore partial multi-char replay',
);
assert(
  shouldIgnoreStalePostSendChange('hello', 'x', 'x') === false,
  'never suppress when controlled value already updated',
);

// --- conversationDisplay ---
const baseConv = {
  id: 'c1',
  isGroup: false,
  name: 'Alice',
  avatarUrl: 'https://alice.png',
  isOnline: false,
  participants: [
    { userId: 'me', displayName: 'Me', avatarUrl: 'https://me.png', isOnline: true },
    { userId: 'alice', displayName: 'Alice', avatarUrl: 'https://alice.png', isOnline: false },
  ],
};

const afterSelfUpdate = applyProfileUpdateToConversation(
  baseConv,
  { userId: 'me', displayName: 'Me Updated', avatarUrl: 'https://me-new.png' },
  'me',
);
assert(afterSelfUpdate.name === 'Alice', '1:1 list name unchanged when self profile updates');
assert(afterSelfUpdate.avatarUrl === 'https://alice.png', '1:1 list avatar unchanged when self profile updates');
assert(
  afterSelfUpdate.participants.find(p => p.userId === 'me').displayName === 'Me Updated',
  'participant row still updates for self',
);

const afterPartnerUpdate = applyProfileUpdateToConversation(
  baseConv,
  { userId: 'alice', displayName: 'Alice Smith', avatarUrl: 'https://alice-new.png' },
  'me',
);
assert(afterPartnerUpdate.name === 'Alice Smith', '1:1 list name updates for partner');
assert(afterPartnerUpdate.avatarUrl === 'https://alice-new.png', '1:1 list avatar updates for partner');

const groupConv = {
  ...baseConv,
  isGroup: true,
  name: 'Team Chat',
  avatarUrl: null,
  participants: [
    { userId: 'me', displayName: 'Me', avatarUrl: null, isOnline: true },
    { userId: 'alice', displayName: 'Alice', avatarUrl: null, isOnline: false },
    { userId: 'bob', displayName: 'Bob', avatarUrl: null, isOnline: false },
  ],
};
const afterGroupMemberUpdate = applyProfileUpdateToConversation(
  groupConv,
  { userId: 'alice', displayName: 'Alice S', avatarUrl: 'https://a.png' },
  'me',
);
assert(afterGroupMemberUpdate.name === 'Team Chat', 'group display name not overwritten by member profile update');

console.log('All bugfix verification checks passed.');
