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

// Tier hierarchy: Lower number = more authority
// 0: Owner, 1: Admin, 2: Moderator, 3: Member
export type RoleTier = 0 | 1 | 2 | 3;

export const TIER_NAMES: Record<RoleTier, string> = {
  0: 'Owner',
  1: 'Admin',
  2: 'Moderator',
  3: 'Member',
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
  category: 'Program' | 'Channel' | 'Member';
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
}

export interface MemberRole {
  id: string;
  name: string;
  color: string;
  position: number;
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
// NAVIGATION TYPES
// ============================================

export type RootStackParamList = {
  // Auth Stack
  Login: undefined;
  
  // Main Stack
  Main: undefined;
  ProgramDetail: { programId: string };
  Channel: { channelId: string; channelName: string };
  MemberDirectory: { programId: string; programName: string };
  MemberProfile: { programId: string; memberId: string; memberName: string };
  RolesList: { programId: string; programName: string };
  RoleDetail: { programId: string; roleId: string; roleName: string };
  CreateRole: { programId: string };
  AssignRoles: { programId: string; memberId: string; memberName: string };
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
