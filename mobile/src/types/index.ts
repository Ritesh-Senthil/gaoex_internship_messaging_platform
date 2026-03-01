/**
 * TypeScript types for the InternHub mobile app
 */

// ============================================
// USER TYPES
// ============================================

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  // Profile fields (returned by /users/me, /users/:id, auth endpoints)
  bio?: string | null;
  bannerColor?: string;           // Hex color, defaults to "#3B82F6"
  statusEmoji?: string | null;
  statusText?: string | null;
  statusExpiresAt?: string | null;
  authProvider?: string;
  createdAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

// ============================================
// PROGRAM TYPES
// ============================================

export interface Program {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  inviteCode?: string;
  isDefault: boolean;
  isPrivate?: boolean;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  memberCount: number;
  channelCount: number;
  roles: Role[];
  joinedAt: string;
  nickname: string | null;
  isOwner?: boolean;
}

export interface ProgramDetail {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  inviteCode: string;
  isDefault: boolean;
  isPrivate: boolean;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  owner: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  categories: Category[];
  channels: Channel[]; // Uncategorized channels
  _count: {
    memberships: number;
  };
}

// ============================================
// ROLE TYPES
// ============================================

// Tier hierarchy: Lower number = more authority
// 0: Owner, 1: Admin, 2: Member
export type RoleTier = 0 | 1 | 2;

export const TIER_NAMES: Record<RoleTier, string> = {
  0: 'Owner',
  1: 'Admin',
  2: 'Member',
};

export interface Role {
  id: string;
  name: string;
  color: string;
  tier: RoleTier;
  tierName?: string;
  permissions: string; // BigInt as string
  isHoisted: boolean;
  isMentionable: boolean;
  isEveryone: boolean;
  memberCount?: number;
  permissionNames?: string[];
}

export interface RoleDetail extends Role {
  members: {
    id: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
  }[];
}

export interface Permission {
  key: string;
  name: string;
  description: string;
  category: 'Program' | 'Channel';
  minTier?: number;
}

export interface TierInfo {
  tier: number;
  name: string;
  description: string;
  canCreate?: boolean;
}

// ============================================
// CHANNEL TYPES
// ============================================

export interface Category {
  id: string;
  name: string;
  position: number;
  channels: Channel[];
}

export interface Channel {
  id: string;
  name: string;
  topic: string | null;
  type: 'TEXT' | 'ANNOUNCEMENT';
  position: number;
  categoryId: string | null;
  isPrivate?: boolean;
  isProtected?: boolean;
  isArchived?: boolean;
  canPost?: boolean;
  canManageMessages?: boolean;
  // Unread tracking
  hasUnread?: boolean;
  mentionCount?: number;
  isMuted?: boolean;
}

// ============================================
// MESSAGE TYPES
// ============================================

export interface MessageReaction {
  emoji: string;
  count: number;
  users: { id: string; displayName: string }[];
  hasReacted?: boolean;
}

export interface Message {
  id: string;
  content: string;
  authorId: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  channelId: string | null;
  conversationId: string | null;
  mentionedUsers: string[];
  mentionedRoles: string[];
  mentionEveryone: boolean;
  isEdited: boolean;
  isPinned: boolean;
  attachments: Attachment[];
  reactions?: MessageReaction[];
  // Thread support
  parentMessageId?: string | null;
  replyCount?: number;
  lastReplyAt?: string | null;
  latestReplyAuthors?: { id: string; displayName: string; avatarUrl: string | null }[];
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  category?: 'image' | 'video' | 'audio' | 'document';
}

// ============================================
// CONVERSATION (DM) TYPES
// ============================================

export interface Conversation {
  id: string;
  isGroup: boolean;
  name: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt?: string;
  // Group DM fields (only present when isGroup === true)
  groupName?: string | null;    // Custom name set by a participant (null = use comma-separated names)
  createdById?: string | null;  // User who created the group
  participants: ConversationParticipant[];
  lastMessage: {
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  isMuted?: boolean;
  updatedAt: string;
}

export interface ConversationParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
}

export interface DMMessage {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  isEdited: boolean;
  isPinned: boolean;
  attachments?: Attachment[];
  reactions?: MessageReaction[];
  // Thread support
  parentMessageId?: string | null;
  replyCount?: number;
  lastReplyAt?: string | null;
  latestReplyAuthors?: { id: string; displayName: string; avatarUrl: string | null }[];
  createdAt: string;
  updatedAt: string;
}

// ============================================
// MEMBER TYPES
// ============================================

export interface ProgramMember {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string;
  isSuperAdmin: boolean;
  isOwner: boolean;
  nickname: string | null;
  roles: MemberRole[];
  joinedAt: string;
  accountCreatedAt?: string;
  // Profile fields (populated from User)
  bio?: string | null;
  bannerColor?: string;
  statusEmoji?: string | null;
  statusText?: string | null;
  statusExpiresAt?: string | null;
}

export interface MemberRole {
  id: string;
  name: string;
  color: string;
  isHoisted?: boolean;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    stack?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================
// SEARCH TYPES
// ============================================

export interface SearchResult {
  id: string;
  content: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  createdAt: string;
  isEdited: boolean;
  parentMessageId?: string | null;
  context: ChannelSearchContext | DMSearchContext;
}

export interface ChannelSearchContext {
  type: 'channel';
  channelId: string;
  channelName: string;
  programId: string;
  programName: string;
}

export interface DMSearchContext {
  type: 'dm';
  conversationId: string;
  conversationName: string;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  scope: 'all' | 'channels' | 'dms';
  total: number;
  hasMore: boolean;
}

export interface ChannelSearchResult {
  id: string;
  name: string;
  type: 'TEXT' | 'ANNOUNCEMENT';
  isPrivate: boolean;
  programId: string;
  programName: string;
}

// ============================================
// NAVIGATION TYPES
// ============================================

export type RootStackParamList = {
  // Auth Stack
  Login: undefined;
  
  // Main Stack
  Main: undefined;
  ProgramDetail: { programId: string };
  Channel: { channelId: string; channelName: string; programId: string; highlightMessageId?: string };
  MemberDirectory: { programId: string; programName: string };
  MemberProfile: { programId: string; memberId?: string; userId?: string; memberName: string };
  RolesList: { programId: string; programName: string };
  RoleDetail: { programId: string; roleId: string; roleName: string };
  CreateRole: { programId: string };
  AssignRoles: { programId: string; memberId: string; memberName: string };
  Conversation: { conversationId: string; name: string; highlightMessageId?: string };
  NewConversation: undefined;
  GroupInfo: { conversationId: string; groupName: string };
  Thread: { messageId: string; channelId?: string; conversationId?: string; channelName?: string; conversationName?: string };
  JoinProgram: undefined;
  CreateProgram: undefined;
  ProgramSettings: { programId: string; programName: string };
  ChannelManagement: { programId: string; programName: string };
  ChannelPermissions: { programId: string; channelId: string; channelName: string };
  PinnedMessages: { channelId?: string; conversationId?: string; title: string; programId?: string };
};

export type MainTabParamList = {
  Programs: undefined;
  DirectMessages: undefined;
  SearchTab: undefined;
  Profile: undefined;
};
