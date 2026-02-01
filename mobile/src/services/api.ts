/**
 * API Client for InternHub Backend
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_CONFIG, APP_CONFIG } from '../constants/config';
import { ApiResponse, AuthTokens, User, Program, ProgramDetail, Message, Channel, ProgramMember, Role, RoleDetail, Permission, Conversation, DMMessage } from '../types';

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
    console.error('Failed to load tokens:', error);
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

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    
    // If 401 and we haven't retried yet, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry && refreshToken) {
      originalRequest._retry = true;
      
      try {
        const response = await axios.post<ApiResponse<{ tokens: AuthTokens }>>(
          `${API_CONFIG.BASE_URL}/auth/refresh`,
          { refreshToken }
        );
        
        const newTokens = response.data.data.tokens;
        await setTokens(newTokens);
        
        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        await clearTokens();
        // You might want to trigger a logout event here
        return Promise.reject(refreshError);
      }
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
   * Update user profile
   */
  async updateProfile(data: {
    displayName?: string;
    avatarUrl?: string;
  }): Promise<ApiResponse<{ user: User }>> {
    const response = await api.patch('/users/me', data);
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
  }): Promise<ApiResponse<{ program: Program }>> {
    const response = await api.post('/programs', data);
    return response.data;
  },
  
  /**
   * Join program via invite code
   */
  async joinProgram(inviteCode: string): Promise<ApiResponse<{ program: Program }>> {
    const response = await api.post('/programs/join', { inviteCode });
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
   * Send a message to a channel
   */
  async sendMessage(channelId: string, content: string): Promise<ApiResponse<{ message: Message }>> {
    const response = await api.post(`/channels/${channelId}/messages`, { content });
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
   * Reorder roles
   */
  async reorderRoles(programId: string, roleIds: string[]): Promise<ApiResponse<{ roles: Role[] }>> {
    const response = await api.patch(`/programs/${programId}/roles/reorder`, { roleIds });
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
   * Create a new conversation
   */
  async createConversation(participantIds: string[]): Promise<ApiResponse<{ conversation: Conversation; isExisting: boolean }>> {
    const response = await api.post('/conversations', { participantIds });
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
   * Send a message in a conversation
   */
  async sendMessage(conversationId: string, content: string): Promise<ApiResponse<{ message: DMMessage }>> {
    const response = await api.post(`/conversations/${conversationId}/messages`, { content });
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
    const response = await api.get('/messages/reactions/common');
    return response.data;
  },
};

export default api;
