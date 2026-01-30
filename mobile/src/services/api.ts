/**
 * API Client for InternHub Backend
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_CONFIG, APP_CONFIG } from '../constants/config';
import { ApiResponse, AuthTokens, User, Program } from '../types';

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
   * Get program by ID
   */
  async getProgram(programId: string): Promise<ApiResponse<{ program: Program }>> {
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
};

export default api;
