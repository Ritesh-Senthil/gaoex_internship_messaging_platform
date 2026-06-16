/**
 * API Client for InternHub Backend
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_CONFIG, APP_CONFIG } from '../constants/config';
import { useConnectionStore } from '../store/connectionStore';
import { ApiResponse, AuthTokens, User, Program, ProgramDetail, Message, Channel, Category, ProgramMember, Role, RoleDetail, Permission, Conversation, DMMessage, SearchResponse, ChannelSearchResult, ForwardDestinations, ForwardResult } from '../types';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
let accessToken: string | null = null;
let refreshToken: string | null = null;

// Callback invoked when token refresh fails (registered by authStore)
let onTokenRefreshFailed: (() => void) | null = null;

export function setOnTokenRefreshFailed(callback: () => void): void {
  onTokenRefreshFailed = callback;
}

/**
 * Set tokens in memory and secure storage
 */
export async function setTokens(tokens: AuthTokens): Promise<void> {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  
  await SecureStore.setItemAsync(APP_CONFIG.STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
  await SecureStore.setItemAsync(APP_CONFIG.STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
}

/**
 * Load tokens from secure storage
 */
export async function loadTokens(): Promise<boolean> {
  try {
    accessToken = await SecureStore.getItemAsync(APP_CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
    refreshToken = await SecureStore.getItemAsync(APP_CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
    return !!accessToken;
  } catch (error) {
    // silently ignore
    return false;
  }
}

/**
 * Clear tokens
 */
export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  
  await SecureStore.deleteItemAsync(APP_CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(APP_CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
}

/**
 * Get current access token
 */
export function getAccessToken(): string | null {
  return accessToken;
}

// Single-flight refresh: refresh tokens are single-use on the backend, so
// concurrent refreshers (e.g. an HTTP 401 and the socket's auth_error) MUST
// share one in-flight request or one of them invalidates the other's token.
let refreshPromise: Promise<string | null> | null = null;

/**
 * Refresh the access token using the stored refresh token.
 * Returns the new access token, or null if refresh failed (in which case
 * tokens are cleared and the refresh-failed callback fires → logout).
 * Safe to call concurrently — callers share a single in-flight refresh.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    if (!refreshToken) return null;
    try {
      const response = await axios.post<ApiResponse<{ tokens: AuthTokens }>>(
        `${API_CONFIG.BASE_URL}/auth/refresh`,
        { refreshToken }
      );
      const newTokens = response.data.data.tokens;
      await setTokens(newTokens);
      return newTokens.accessToken;
    } catch (refreshError) {
      await clearTokens();
      if (onTokenRefreshFailed) onTokenRefreshFailed();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh + server availability
api.interceptors.response.use(
  (response) => {
    useConnectionStore.getState().setServerOk();
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const isNetworkFailure =
      !error.response &&
      (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.message === 'Network Error');
    const isServerDown =
      error.response?.status === 503 ||
      (error.response?.status === 500 &&
        typeof error.response.data === 'object' &&
        error.response.data !== null &&
        (error.response.data as { error?: { message?: string } }).error?.message === 'Database error');

    if (isNetworkFailure || isServerDown) {
      useConnectionStore.getState().setServerUnavailable();
    }
    
    // If 401 and we haven't retried yet, try to refresh token (single-flight).
    if (error.response?.status === 401 && !originalRequest._retry && refreshToken) {
      originalRequest._retry = true;

      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return api(originalRequest);
      }
      // refreshAccessToken already cleared tokens + fired the logout callback.
    }
    
    return Promise.reject(error);
  }
);

// ============================================
// AUTH API
// ============================================

export const authApi = {
  /**
   * Authenticate with Firebase token
   */
  async loginWithFirebase(idToken: string): Promise<ApiResponse<{
    user: User;
    tokens: AuthTokens;
    isNewUser: boolean;
  }>> {
    const response = await api.post('/auth/firebase', { idToken });
    
    // Store tokens
    if (response.data.success) {
      await setTokens(response.data.data.tokens);
    }
    
    return response.data;
  },
  
  /**
   * Refresh access token
   */
  async refreshToken(): Promise<ApiResponse<{ tokens: AuthTokens }>> {
    const response = await api.post('/auth/refresh', { refreshToken });
    
    if (response.data.success) {
      await setTokens(response.data.data.tokens);
    }
    
    return response.data;
  },
  
  /**
   * Logout
   */
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout', { refreshToken });
    } finally {
      await clearTokens();
    }
  },
};

// ============================================
// USER API
// ============================================

export const userApi = {
  /**
   * Get current user profile
   */
  async getMe(): Promise<ApiResponse<{ user: User; programs: Program[] }>> {
    const response = await api.get('/users/me');
    return response.data;
  },
  
  /**
   * Update user profile (display name, bio, banner color, custom status)
   */
  async updateProfile(data: {
    displayName?: string;
    avatarUrl?: string;
    bio?: string | null;
    bannerColor?: string;
    statusEmoji?: string | null;
    statusText?: string | null;
    statusExpiresAt?: string | null;
  }): Promise<ApiResponse<{ user: User }>> {
    const response = await api.patch('/users/me', data);
    return response.data;
  },

  /**
   * Upload avatar image
   * @param imageUri - Local file URI from image picker
   */
  async uploadAvatar(imageUri: string): Promise<ApiResponse<{ user: User }>> {
    const formData = new FormData();
    
    // Extract filename and type from URI
    const uriParts = imageUri.split('/');
    const fileName = uriParts[uriParts.length - 1] || 'avatar.jpg';
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = fileExtension === 'png' ? 'image/png'
      : fileExtension === 'gif' ? 'image/gif'
      : fileExtension === 'webp' ? 'image/webp'
      : 'image/jpeg';

    formData.append('avatar', {
      uri: imageUri,
      name: fileName,
      type: mimeType,
    } as any);

    const response = await api.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Remove avatar (revert to letter initial)
   */
  async removeAvatar(): Promise<ApiResponse<{ user: User }>> {
    const response = await api.delete('/users/me/avatar');
    return response.data;
  },

  async getSharedProgram(userId: string): Promise<ApiResponse<{ programId: string | null }>> {
    const response = await api.get(`/users/${userId}/shared-program`);
    return response.data;
  },
  
  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<ApiResponse<{ user: User }>> {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },

  /**
   * Search users by name or email
   */
  async searchUsers(query: string): Promise<ApiResponse<{ users: Array<{ id: string; displayName: string; email: string; avatarUrl: string | null }> }>> {
    const response = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },
};

// ============================================
// PUSH TOKEN API
// ============================================

export const pushTokenApi = {
  /**
   * Register a push token with the backend
   */
  async register(token: string, platform: string = 'ios'): Promise<ApiResponse<{ pushToken: any }>> {
    const response = await api.post('/users/push-token', { token, platform });
    return response.data;
  },

  /**
   * Remove a push token from the backend
   */
  async remove(token: string): Promise<ApiResponse<void>> {
    const response = await api.delete('/users/push-token', { data: { token } });
    return response.data;
  },
};

// ============================================
// MUTE API (channels and conversations)
// ============================================

export const muteApi = {
  /**
   * Toggle mute for a channel
   */
  async toggleChannelMute(channelId: string, muted?: boolean): Promise<ApiResponse<{ isMuted: boolean }>> {
    const response = await api.post(`/channels/${channelId}/mute`, muted !== undefined ? { muted } : {});
    return response.data;
  },

  /**
   * Get mute status for a channel
   */
  async getChannelMuteStatus(channelId: string): Promise<ApiResponse<{ isMuted: boolean }>> {
    const response = await api.get(`/channels/${channelId}/mute`);
    return response.data;
  },

  /**
   * Toggle mute for a conversation
   */
  async toggleConversationMute(conversationId: string, muted?: boolean): Promise<ApiResponse<{ isMuted: boolean }>> {
    const response = await api.post(`/conversations/${conversationId}/mute`, muted !== undefined ? { muted } : {});
    return response.data;
  },

  /**
   * Get mute status for a conversation
   */
  async getConversationMuteStatus(conversationId: string): Promise<ApiResponse<{ isMuted: boolean }>> {
    const response = await api.get(`/conversations/${conversationId}/mute`);
    return response.data;
  },
};

// ============================================
// PROGRAM API
// ============================================

export const programApi = {
  /**
   * Get user's programs
   */
  async getPrograms(): Promise<ApiResponse<{ programs: Program[] }>> {
    const response = await api.get('/programs');
    return response.data;
  },
  
  /**
   * Get program by ID (with full details including categories and channels)
   */
  async getProgram(programId: string): Promise<ApiResponse<{ program: ProgramDetail }>> {
    const response = await api.get(`/programs/${programId}`);
    return response.data;
  },
  
  /**
   * Create a new program
   */
  async createProgram(data: {
    name: string;
    description?: string;
    iconUrl?: string;
    isPrivate?: boolean;
  }): Promise<ApiResponse<{ program: Program }>> {
    const response = await api.post('/programs', data);
    return response.data;
  },
  
  /**
   * Join program via invite code
   * Returns either:
   * - { program: Program } for public programs (direct join)
   * - { status: 'PENDING', programName: string, isPrivate: true } for private programs (join request)
   */
  async joinProgram(inviteCode: string, message?: string): Promise<ApiResponse<{ 
    program?: Program; 
    status?: 'PENDING'; 
    programName?: string; 
    isPrivate?: boolean;
    requestId?: string;
  }>> {
    const response = await api.post('/programs/join', { inviteCode, message });
    return response.data;
  },
  
  /**
   * Regenerate invite code
   */
  async regenerateInviteCode(programId: string): Promise<ApiResponse<{ inviteCode: string }>> {
    const response = await api.post(`/programs/${programId}/invite/regenerate`);
    return response.data;
  },

  /**
   * Update program settings
   */
  async updateProgram(programId: string, data: {
    name?: string;
    description?: string | null;
    iconUrl?: string | null;
    isPrivate?: boolean;
  }): Promise<ApiResponse<{ program: Program }>> {
    const response = await api.patch(`/programs/${programId}`, data);
    return response.data;
  },

  /**
   * Archive a program
   */
  async archiveProgram(programId: string): Promise<ApiResponse<{ message: string }>> {
    const response = await api.patch(`/programs/${programId}/archive`);
    return response.data;
  },

  /**
   * Restore an archived program
   */
  async restoreProgram(programId: string): Promise<ApiResponse<{ message: string }>> {
    const response = await api.patch(`/programs/${programId}/restore`);
    return response.data;
  },

  /**
   * Delete a program permanently
   */
  async deleteProgram(programId: string): Promise<ApiResponse<{ message: string }>> {
    const response = await api.delete(`/programs/${programId}`);
    return response.data;
  },

  /**
   * Get pending join requests for a program
   */
  async getJoinRequests(programId: string): Promise<ApiResponse<{ requests: Array<{
    id: string;
    message: string | null;
    createdAt: string;
    user: {
      id: string;
      displayName: string;
      email: string;
      avatarUrl: string | null;
    };
  }> }>> {
    const response = await api.get(`/programs/${programId}/join-requests`);
    return response.data;
  },

  /**
   * Approve a join request
   */
  async approveJoinRequest(programId: string, requestId: string): Promise<ApiResponse<{ message: string }>> {
    const response = await api.post(`/programs/${programId}/join-requests/${requestId}/approve`);
    return response.data;
  },

  /**
   * Reject a join request
   */
  async rejectJoinRequest(programId: string, requestId: string): Promise<ApiResponse<{ message: string }>> {
    const response = await api.post(`/programs/${programId}/join-requests/${requestId}/reject`);
    return response.data;
  },

  /**
   * Get all members of a program
   */
  async getMembers(programId: string): Promise<ApiResponse<{ members: ProgramMember[] }>> {
    const response = await api.get(`/programs/${programId}/members`);
    return response.data;
  },

  /**
   * Get a specific member's profile
   */
  async getMember(programId: string, memberId: string): Promise<ApiResponse<{ member: ProgramMember }>> {
    const response = await api.get(`/programs/${programId}/members/${memberId}`);
    return response.data;
  },

  async getMemberByUserId(programId: string, userId: string): Promise<ApiResponse<{ member: ProgramMember }>> {
    const response = await api.get(`/programs/${programId}/members/by-user/${userId}`);
    return response.data;
  },

  // ============================================
  // CATEGORY MANAGEMENT
  // ============================================

  /**
   * Create a new category
   */
  async createCategory(programId: string, name: string): Promise<ApiResponse<{ category: Category }>> {
    const response = await api.post(`/programs/${programId}/categories`, { name });
    return response.data;
  },

  /**
   * Update a category
   */
  async updateCategory(programId: string, categoryId: string, name: string): Promise<ApiResponse<{ category: Category }>> {
    const response = await api.patch(`/programs/${programId}/categories/${categoryId}`, { name });
    return response.data;
  },

  /**
   * Delete a category
   */
  async deleteCategory(programId: string, categoryId: string): Promise<ApiResponse<{ message: string }>> {
    const response = await api.delete(`/programs/${programId}/categories/${categoryId}`);
    return response.data;
  },

  // ============================================
  // CHANNEL MANAGEMENT
  // ============================================

  /**
   * Create a new channel
   */
  async createChannel(programId: string, data: {
    name: string;
    topic?: string;
    type?: 'TEXT' | 'ANNOUNCEMENT';
    categoryId?: string | null;
    isPrivate?: boolean;
  }): Promise<ApiResponse<{ channel: Channel }>> {
    const response = await api.post(`/programs/${programId}/channels`, data);
    return response.data;
  },

  /**
   * Update a channel
   */
  async updateChannel(programId: string, channelId: string, data: {
    name?: string;
    topic?: string;
    type?: 'TEXT' | 'ANNOUNCEMENT';
    categoryId?: string | null;
    isPrivate?: boolean;
  }): Promise<ApiResponse<{ channel: Channel }>> {
    const response = await api.patch(`/programs/${programId}/channels/${channelId}`, data);
    return response.data;
  },

  /**
   * Delete a channel
   */
  async deleteChannel(programId: string, channelId: string): Promise<ApiResponse<{ message: string }>> {
    const response = await api.delete(`/programs/${programId}/channels/${channelId}`);
    return response.data;
  },

  /**
   * Move a channel to a different category
   */
  async moveChannel(programId: string, channelId: string, categoryId: string | null, position?: number): Promise<ApiResponse<{ channel: Channel }>> {
    const response = await api.post(`/programs/${programId}/channels/${channelId}/move`, { categoryId, position });
    return response.data;
  },

  /**
   * Get channel permissions
   */
  async getChannelPermissions(programId: string, channelId: string): Promise<ApiResponse<{
    channel: { id: string; name: string; isPrivate: boolean };
    permissions: Array<{
      id: string;
      role?: { id: string; name: string; color: string };
      user?: { id: string; displayName: string; avatarUrl: string | null };
    }>;
  }>> {
    const response = await api.get(`/programs/${programId}/channels/${channelId}/permissions`);
    return response.data;
  },

  /**
   * Set channel permissions
   */
  async setChannelPermissions(programId: string, channelId: string, roleIds: string[], userIds: string[]): Promise<ApiResponse<{ message: string }>> {
    const response = await api.put(`/programs/${programId}/channels/${channelId}/permissions`, { roleIds, userIds });
    return response.data;
  },
};

// ============================================
// CHANNEL API
// ============================================

export const channelApi = {
  /**
   * Get channel details
   */
  async getChannel(channelId: string): Promise<ApiResponse<{ channel: Channel }>> {
    const response = await api.get(`/channels/${channelId}`);
    return response.data;
  },

  /**
   * Get messages in a channel
   */
  async getMessages(
    channelId: string,
    options?: { limit?: number; before?: string; after?: string }
  ): Promise<ApiResponse<{ messages: Message[]; hasMore: boolean }>> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.before) params.append('before', options.before);
    if (options?.after) params.append('after', options.after);

    const queryString = params.toString();
    const url = `/channels/${channelId}/messages${queryString ? `?${queryString}` : ''}`;
    const response = await api.get(url);
    return response.data;
  },

  /**
   * Send a message to a channel (optionally as a thread reply)
   */
  async sendMessage(channelId: string, content: string, parentMessageId?: string, clientId?: string): Promise<ApiResponse<{ message: Message }>> {
    const body: { content: string; parentMessageId?: string; clientId?: string } = { content };
    if (parentMessageId) body.parentMessageId = parentMessageId;
    if (clientId) body.clientId = clientId;
    const response = await api.post(`/channels/${channelId}/messages`, body);
    return response.data;
  },

  /**
   * Get thread replies for a channel message
   */
  async getThreadReplies(
    messageId: string,
    options?: { limit?: number; before?: string }
  ): Promise<ApiResponse<{ parentMessage: Message; replies: Message[]; hasMore: boolean }>> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.before) params.append('before', options.before);
    const queryString = params.toString();
    const url = `/channels/messages/${messageId}/thread${queryString ? `?${queryString}` : ''}`;
    const response = await api.get(url);
    return response.data;
  },

  /**
   * Edit a message
   */
  async editMessage(
    channelId: string,
    messageId: string,
    content: string
  ): Promise<ApiResponse<{ message: Message }>> {
    const response = await api.patch(`/channels/${channelId}/messages/${messageId}`, { content });
    return response.data;
  },

  /**
   * Delete a message
   */
  async deleteMessage(channelId: string, messageId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/channels/${channelId}/messages/${messageId}`);
    return response.data;
  },

  /**
   * Pin a message
   */
  async pinMessage(channelId: string, messageId: string): Promise<ApiResponse<{ message: Message }>> {
    const response = await api.post(`/channels/${channelId}/messages/${messageId}/pin`);
    return response.data;
  },

  /**
   * Unpin a message
   */
  async unpinMessage(channelId: string, messageId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/channels/${channelId}/messages/${messageId}/pin`);
    return response.data;
  },

  /**
   * Get all pinned messages in a channel
   */
  async getPinnedMessages(channelId: string): Promise<ApiResponse<{ messages: Message[]; count: number }>> {
    const response = await api.get(`/channels/${channelId}/pinned`);
    return response.data;
  },

  /**
   * Mark channel as read
   */
  async markAsRead(channelId: string, lastReadMessageId?: string): Promise<ApiResponse<void>> {
    const response = await api.post(`/channels/${channelId}/read`, { lastReadMessageId });
    return response.data;
  },

  /**
   * Get unread status for a channel
   */
  async getUnreadStatus(channelId: string): Promise<ApiResponse<{
    channelId: string;
    unreadCount: number;
    mentionCount: number;
    lastReadAt: string | null;
  }>> {
    const response = await api.get(`/channels/${channelId}/unread`);
    return response.data;
  },
};

// ============================================
// ROLE API
// ============================================

export const roleApi = {
  /**
   * Get all roles in a program
   */
  async getRoles(programId: string): Promise<ApiResponse<{ roles: Role[] }>> {
    const response = await api.get(`/programs/${programId}/roles`);
    return response.data;
  },

  /**
   * Get a specific role with details
   */
  async getRole(programId: string, roleId: string): Promise<ApiResponse<{ role: RoleDetail }>> {
    const response = await api.get(`/programs/${programId}/roles/${roleId}`);
    return response.data;
  },

  /**
   * Create a new role
   */
  async createRole(
    programId: string,
    data: {
      name: string;
      color?: string;
      tier?: number;
      permissions?: string[];
      isHoisted?: boolean;
      isMentionable?: boolean;
    }
  ): Promise<ApiResponse<{ role: Role }>> {
    const response = await api.post(`/programs/${programId}/roles`, data);
    return response.data;
  },

  /**
   * Update a role
   */
  async updateRole(
    programId: string,
    roleId: string,
    data: {
      name?: string;
      color?: string;
      tier?: number;
      permissions?: string[];
      isHoisted?: boolean;
      isMentionable?: boolean;
    }
  ): Promise<ApiResponse<{ role: Role }>> {
    const response = await api.patch(`/programs/${programId}/roles/${roleId}`, data);
    return response.data;
  },

  /**
   * Delete a role
   */
  async deleteRole(programId: string, roleId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/programs/${programId}/roles/${roleId}`);
    return response.data;
  },

  /**
   * Assign a role to a member
   */
  async assignRole(programId: string, memberId: string, roleId: string): Promise<ApiResponse<{ member: ProgramMember }>> {
    const response = await api.post(`/programs/${programId}/members/${memberId}/roles`, { roleId });
    return response.data;
  },

  /**
   * Remove a role from a member
   */
  async removeRole(programId: string, memberId: string, roleId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/programs/${programId}/members/${memberId}/roles/${roleId}`);
    return response.data;
  },

  /**
   * Get available permissions list
   */
  async getPermissions(): Promise<ApiResponse<{ permissions: Permission[] }>> {
    const response = await api.get(`/programs/permissions`);
    return response.data;
  },
};

// ============================================
// CONVERSATION API
// ============================================

export const conversationApi = {
  /**
   * Get all conversations for current user
   */
  async getConversations(): Promise<ApiResponse<{ conversations: Conversation[] }>> {
    const response = await api.get('/conversations');
    return response.data;
  },

  /**
   * Create a new conversation (1:1 or group)
   * @param participantIds - User IDs to include (current user is auto-included)
   * @param name - Optional group name (only used when creating a group with 2+ others)
   */
  async createConversation(participantIds: string[], name?: string): Promise<ApiResponse<{ conversation: Conversation; isExisting: boolean }>> {
    const body: { participantIds: string[]; name?: string } = { participantIds };
    if (name !== undefined && name.trim()) {
      body.name = name.trim();
    }
    const response = await api.post('/conversations', body);
    return response.data;
  },

  /**
   * Get a single conversation
   */
  async getConversation(conversationId: string): Promise<ApiResponse<{ conversation: Conversation }>> {
    const response = await api.get(`/conversations/${conversationId}`);
    return response.data;
  },

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, limit = 50, before?: string): Promise<ApiResponse<{ messages: DMMessage[]; hasMore: boolean }>> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (before) params.append('before', before);
    const response = await api.get(`/conversations/${conversationId}/messages?${params}`);
    return response.data;
  },

  /**
   * Send a message in a conversation (optionally as a thread reply)
   */
  async sendMessage(conversationId: string, content: string, parentMessageId?: string, clientId?: string): Promise<ApiResponse<{ message: DMMessage }>> {
    const body: { content: string; parentMessageId?: string; clientId?: string } = { content };
    if (parentMessageId) body.parentMessageId = parentMessageId;
    if (clientId) body.clientId = clientId;
    const response = await api.post(`/conversations/${conversationId}/messages`, body);
    return response.data;
  },

  /**
   * Get thread replies for a DM message
   */
  async getThreadReplies(
    conversationId: string,
    messageId: string,
    options?: { limit?: number; before?: string }
  ): Promise<ApiResponse<{ parentMessage: DMMessage; replies: DMMessage[]; hasMore: boolean }>> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.before) params.append('before', options.before);
    const queryString = params.toString();
    const url = `/conversations/${conversationId}/messages/${messageId}/thread${queryString ? `?${queryString}` : ''}`;
    const response = await api.get(url);
    return response.data;
  },

  /**
   * Mark conversation as read
   */
  async markAsRead(conversationId: string): Promise<ApiResponse<void>> {
    const response = await api.post(`/conversations/${conversationId}/read`);
    return response.data;
  },

  /**
   * Delete/leave a conversation
   */
  async deleteConversation(conversationId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/conversations/${conversationId}`);
    return response.data;
  },

  /**
   * Edit a message in a conversation
   */
  async editMessage(conversationId: string, messageId: string, content: string): Promise<ApiResponse<{ message: DMMessage }>> {
    const response = await api.patch(`/conversations/${conversationId}/messages/${messageId}`, { content });
    return response.data;
  },

  /**
   * Delete a message in a conversation
   */
  async deleteMessage(conversationId: string, messageId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/conversations/${conversationId}/messages/${messageId}`);
    return response.data;
  },

  /**
   * Pin a message in a conversation
   */
  async pinMessage(conversationId: string, messageId: string): Promise<ApiResponse<{ message: DMMessage }>> {
    const response = await api.post(`/conversations/${conversationId}/messages/${messageId}/pin`);
    return response.data;
  },

  /**
   * Unpin a message in a conversation
   */
  async unpinMessage(conversationId: string, messageId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/conversations/${conversationId}/messages/${messageId}/pin`);
    return response.data;
  },

  /**
   * Get all pinned messages in a conversation
   */
  async getPinnedMessages(conversationId: string): Promise<ApiResponse<{ messages: DMMessage[]; count: number }>> {
    const response = await api.get(`/conversations/${conversationId}/pinned`);
    return response.data;
  },

  /**
   * Rename a group conversation
   */
  async renameGroup(conversationId: string, name: string): Promise<ApiResponse<{ conversation: any }>> {
    const response = await api.patch(`/conversations/${conversationId}`, { name });
    return response.data;
  },

  /**
   * Add participants to a group conversation
   */
  async addParticipants(conversationId: string, userIds: string[]): Promise<ApiResponse<{ conversation: any }>> {
    const response = await api.post(`/conversations/${conversationId}/participants`, { userIds });
    return response.data;
  },

  /**
   * Leave/delete a conversation (for groups: leave; for 1:1: delete)
   */
  async leaveConversation(conversationId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/conversations/${conversationId}`);
    return response.data;
  },
};

// ============================================
// REACTION API
// ============================================

export interface ReactionData {
  emoji: string;
  count: number;
  users: { id: string; displayName: string }[];
  hasReacted?: boolean;
}

export const reactionApi = {
  /**
   * Get reactions for a message
   */
  async getReactions(messageId: string): Promise<ApiResponse<{ reactions: ReactionData[] }>> {
    const response = await api.get(`/messages/${messageId}/reactions`);
    return response.data;
  },

  /**
   * Add a reaction to a message
   */
  async addReaction(messageId: string, emoji: string): Promise<ApiResponse<{ reaction: any }>> {
    const response = await api.post(`/messages/${messageId}/reactions`, { emoji });
    return response.data;
  },

  /**
   * Remove a reaction from a message
   */
  async removeReaction(messageId: string, emoji: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
    return response.data;
  },

  /**
   * Get common reaction emojis
   */
  async getCommonEmojis(): Promise<ApiResponse<{ emojis: string[] }>> {
    const response = await api.get('/messages/common');
    return response.data;
  },
};

// ============================================
// UPLOAD API
// ============================================

export interface UploadedAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  category: 'image' | 'video' | 'audio' | 'document';
}

export const uploadApi = {
  /**
   * Upload files to a channel
   */
  async uploadToChannel(
    channelId: string,
    files: { uri: string; name: string; type: string }[],
    content?: string,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ message: Message }>> {
    const formData = new FormData();
    
    files.forEach((file) => {
      formData.append('files', {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as any);
    });
    
    if (content) {
      formData.append('content', content);
    }
    
    const response = await api.post(`/upload/channel/${channelId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(progressEvent.loaded / progressEvent.total);
        }
      },
    });
    
    return response.data;
  },

  /**
   * Upload files to a conversation (DM)
   */
  async uploadToConversation(
    conversationId: string,
    files: { uri: string; name: string; type: string }[],
    content?: string,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ message: DMMessage }>> {
    const formData = new FormData();
    
    files.forEach((file) => {
      formData.append('files', {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as any);
    });
    
    if (content) {
      formData.append('content', content);
    }
    
    const response = await api.post(`/upload/conversation/${conversationId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(progressEvent.loaded / progressEvent.total);
        }
      },
    });
    
    return response.data;
  },

  /**
   * Delete an attachment
   */
  async deleteAttachment(attachmentId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/upload/${attachmentId}`);
    return response.data;
  },
};

// ============================================
// SEARCH API
// ============================================

export const searchApi = {
  /**
   * Search messages across accessible channels and DMs
   */
  async searchMessages(params: {
    query: string;
    scope?: 'all' | 'channels' | 'dms';
    limit?: number;
    offset?: number;
    programId?: string;
  }): Promise<ApiResponse<SearchResponse>> {
    const searchParams = new URLSearchParams();
    searchParams.append('q', params.query);
    if (params.scope) searchParams.append('scope', params.scope);
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.offset) searchParams.append('offset', params.offset.toString());
    if (params.programId) searchParams.append('programId', params.programId);

    const response = await api.get(`/search/messages?${searchParams}`);
    return response.data;
  },

  /**
   * Search channels by name across all user's programs
   */
  async searchChannels(query: string, limit = 10): Promise<ApiResponse<{ channels: ChannelSearchResult[] }>> {
    const response = await api.get(`/search/channels?q=${encodeURIComponent(query)}&limit=${limit}`);
    return response.data;
  },
};

// ============================================
// FORWARD API
// ============================================

export const forwardApi = {
  async getDestinations(params?: {
    excludeChannelId?: string;
    excludeConversationId?: string;
  }): Promise<ApiResponse<ForwardDestinations>> {
    const searchParams = new URLSearchParams();
    if (params?.excludeChannelId) searchParams.append('excludeChannelId', params.excludeChannelId);
    if (params?.excludeConversationId) {
      searchParams.append('excludeConversationId', params.excludeConversationId);
    }
    const qs = searchParams.toString();
    const response = await api.get(`/forward/destinations${qs ? `?${qs}` : ''}`);
    return response.data;
  },

  async forwardMessage(data: {
    messageId: string;
    destinationType: 'channel' | 'conversation';
    destinationId: string;
    comment?: string;
  }): Promise<ApiResponse<ForwardResult>> {
    const response = await api.post('/forward', data);
    return response.data;
  },
};

export default api;
