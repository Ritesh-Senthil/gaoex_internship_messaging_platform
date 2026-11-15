/**
 * Where a notification tap goes, and which other notifications that tap clears.
 * Kept free of native modules so the rules can be checked on their own.
 */

export type NotificationData = {
  type?: 'channel_message' | 'dm_message' | 'mention' | 'program_invite' | 'reaction';
  channelId?: string;
  programId?: string;
  channelName?: string;
  conversationId?: string;
  authorName?: string;
  /** The message this notification is about. Older payloads omit it. */
  messageId?: string;
  /** Set when the message is a thread reply. */
  parentMessageId?: string;
};

export type ChatNotificationScope =
  | { kind: 'channel'; channelId: string; tappedIdentifier?: string }
  | { kind: 'conversation'; conversationId: string; tappedIdentifier?: string }
  | { kind: 'thread'; parentMessageId: string; tappedIdentifier?: string };

const MAIN_TABS = ['Programs', 'DirectMessages', 'SearchTab', 'Profile'] as const;

export type NotificationRoute = {
  name: string;
  params?: Record<string, unknown>;
  state?: { index: number; routes: { name: string }[] };
};

function mainRoute(tab: (typeof MAIN_TABS)[number]): NotificationRoute {
  return {
    name: 'Main',
    state: {
      index: MAIN_TABS.indexOf(tab),
      routes: MAIN_TABS.map((name) => ({ name })),
    },
  };
}

/**
 * The screens under a notification tap. Back walks this stack: thread, then
 * the channel or DM, then the program, then the tab the chat belongs to.
 * A reply opens the thread and highlights that reply. A main-chat message
 * highlights that message. Payloads from older app versions have no messageId,
 * so they open the chat without a highlight.
 */
export function notificationStack(data: NotificationData): { index: number; routes: NotificationRoute[] } | null {
  const highlight = data.messageId;
  const inThread = !!data.parentMessageId;
  const channelDestination = data.type === 'channel_message'
    || data.type === 'mention'
    || (data.type === 'reaction' && !!data.channelId);
  const dmDestination = data.type === 'dm_message'
    || (data.type === 'reaction' && !data.channelId && !!data.conversationId);

  if (data.type === 'program_invite') {
    if (!data.programId) return null;
    const routes = [mainRoute('Programs'), { name: 'ProgramDetail', params: { programId: data.programId } }];
    return { index: routes.length - 1, routes };
  }

  if (channelDestination) {
    if (!data.channelId || !data.programId) return null;
    const routes: NotificationRoute[] = [
      mainRoute('Programs'),
      { name: 'ProgramDetail', params: { programId: data.programId } },
      {
        name: 'Channel',
        params: {
          channelId: data.channelId,
          channelName: data.channelName || 'channel',
          programId: data.programId,
          ...(!inThread && highlight ? { highlightMessageId: highlight } : {}),
        },
      },
    ];
    if (inThread && data.parentMessageId) {
      routes.push({
        name: 'Thread',
        params: {
          messageId: data.parentMessageId,
          channelId: data.channelId,
          programId: data.programId,
          channelName: data.channelName || 'channel',
          ...(highlight ? { highlightMessageId: highlight } : {}),
        },
      });
    }
    return { index: routes.length - 1, routes };
  }

  if (dmDestination) {
    if (!data.conversationId) return null;
    const routes: NotificationRoute[] = [
      mainRoute('DirectMessages'),
      {
        name: 'Conversation',
        params: {
          conversationId: data.conversationId,
          name: data.authorName || 'Direct Message',
          ...(!inThread && highlight ? { highlightMessageId: highlight } : {}),
        },
      },
    ];
    if (inThread && data.parentMessageId) {
      routes.push({
        name: 'Thread',
        params: {
          messageId: data.parentMessageId,
          conversationId: data.conversationId,
          conversationName: data.authorName || 'Direct Message',
          ...(highlight ? { highlightMessageId: highlight } : {}),
        },
      });
    }
    return { index: routes.length - 1, routes };
  }

  return null;
}

/**
 * Which tray entries a tap removes. A thread tap clears that thread only.
 * Opening the channel underneath, later, clears the main chat.
 */
export function scopeForOpenedNotification(
  data: NotificationData,
  tappedIdentifier?: string,
): ChatNotificationScope | null {
  if (data.parentMessageId && data.type !== 'program_invite') {
    return { kind: 'thread', parentMessageId: data.parentMessageId, tappedIdentifier };
  }
  if ((data.type === 'channel_message' || data.type === 'mention' || data.type === 'reaction') && data.channelId) {
    return { kind: 'channel', channelId: data.channelId, tappedIdentifier };
  }
  if ((data.type === 'dm_message' || data.type === 'reaction') && data.conversationId) {
    return { kind: 'conversation', conversationId: data.conversationId, tappedIdentifier };
  }
  return null;
}

export function notificationMatchesScope(
  data: NotificationData,
  identifier: string,
  scope: ChatNotificationScope,
): boolean {
  if (scope.tappedIdentifier && identifier === scope.tappedIdentifier) return true;
  if (data.type === 'program_invite') return false;

  if (scope.kind === 'channel') {
    if (data.channelId !== scope.channelId) return false;
    if (data.type === 'channel_message') return true;
    // A reaction on a reply stays until that thread is opened.
    return data.type === 'reaction' && !data.parentMessageId;
  }
  if (scope.kind === 'conversation') {
    if (data.conversationId !== scope.conversationId || data.parentMessageId) return false;
    return data.type === 'dm_message' || data.type === 'reaction';
  }
  return !!data.parentMessageId && data.parentMessageId === scope.parentMessageId;
}
