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
  inviteCode: string;
  isDefault: boolean;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  memberCount: number;
  channelCount: number;
  roles: Role[];
  joinedAt: string;
  nickname: string | null;
}

export interface ProgramDetail {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  inviteCode: string;
  isDefault: boolean;
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

export interface Role {
  id: string;
  name: string;
  color: string;
  position: number;
  permissions: string; // BigInt as string
  isHoisted: boolean;
  isMentionable: boolean;
  isEveryone: boolean;
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
  isArchived: boolean;
}

// ============================================
// MESSAGE TYPES
// ============================================

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
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
}

// ============================================
// CONVERSATION (DM) TYPES
// ============================================

export interface Conversation {
  id: string;
  isGroup: boolean;
  participants: ConversationParticipant[];
  lastMessage: Message | null;
  unreadCount: number;
}

export interface ConversationParticipant {
  id: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  isMuted: boolean;
  lastReadAt: string;
}

// ============================================
// MEMBER TYPES
// ============================================

export interface ProgramMember {
  id: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    lastSeenAt: string;
  };
  nickname: string | null;
  roles: Role[];
  joinedAt: string;
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
// NAVIGATION TYPES
// ============================================

export type RootStackParamList = {
  // Auth Stack
  Login: undefined;
  
  // Main Stack
  Main: undefined;
  ProgramDetail: { programId: string };
  Channel: { channelId: string; channelName: string };
  DirectMessage: { conversationId: string };
  UserProfile: { userId: string };
  Settings: undefined;
  JoinProgram: undefined;
  CreateProgram: undefined;
};

export type MainTabParamList = {
  Programs: undefined;
  DirectMessages: undefined;
  Notifications: undefined;
  Profile: undefined;
};
