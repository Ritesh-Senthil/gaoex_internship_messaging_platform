/**
 * Member Store using Zustand
 * Manages member list state for real-time updates
 */

import { create } from 'zustand';

interface Member {
  id: string;
  odUserId: string;
  displayName: string;
  avatarUrl?: string | null;
  nickname?: string | null;
  roles: Array<{
    id: string;
    name: string;
    color?: string | null;
    tier: number;
  }>;
  joinedAt: string;
  isOnline?: boolean;
}

interface MemberState {
  // State - organized by program
  membersByProgram: Record<string, Member[]>; // programId -> members
  
  // Actions
  setMembers: (programId: string, members: Member[]) => void;
  addMember: (programId: string, member: Member) => void;
  updateMember: (programId: string, odUserId: string, updates: Partial<Member>) => void;
  removeMember: (programId: string, odUserId: string) => void;
  updateMemberRoles: (programId: string, odUserId: string, roles: Member['roles']) => void;
  updateMemberOnlineStatus: (programId: string, odUserId: string, isOnline: boolean) => void;
  
  // Utility
  clearProgram: (programId: string) => void;
  clearAll: () => void;
}

export const useMemberStore = create<MemberState>((set) => ({
  // Initial state
  membersByProgram: {},
  
  /**
   * Set all members for a program (from API)
   */
  setMembers: (programId: string, members: Member[]) => {
    set((state) => ({
      membersByProgram: {
        ...state.membersByProgram,
        [programId]: members,
      },
    }));
  },
  
  /**
   * Add a new member to a program
   */
  addMember: (programId: string, member: Member) => {
    set((state) => {
      const members = state.membersByProgram[programId] || [];
      // Check if member already exists
      if (members.some(m => m.odUserId === member.odUserId)) {
        return state;
      }
      return {
        membersByProgram: {
          ...state.membersByProgram,
          [programId]: [...members, member],
        },
      };
    });
  },
  
  /**
   * Update an existing member
   */
  updateMember: (programId: string, odUserId: string, updates: Partial<Member>) => {
    set((state) => {
      const members = state.membersByProgram[programId] || [];
      return {
        membersByProgram: {
          ...state.membersByProgram,
          [programId]: members.map(m => 
            m.odUserId === odUserId ? { ...m, ...updates } : m
          ),
        },
      };
    });
  },
  
  /**
   * Remove a member from a program
   */
  removeMember: (programId: string, odUserId: string) => {
    set((state) => {
      const members = state.membersByProgram[programId] || [];
      return {
        membersByProgram: {
          ...state.membersByProgram,
          [programId]: members.filter(m => m.odUserId !== odUserId),
        },
      };
    });
  },
  
  /**
   * Update member's roles
   */
  updateMemberRoles: (programId: string, odUserId: string, roles: Member['roles']) => {
    set((state) => {
      const members = state.membersByProgram[programId] || [];
      return {
        membersByProgram: {
          ...state.membersByProgram,
          [programId]: members.map(m => 
            m.odUserId === odUserId ? { ...m, roles } : m
          ),
        },
      };
    });
  },
  
  /**
   * Update member's online status
   */
  updateMemberOnlineStatus: (programId: string, odUserId: string, isOnline: boolean) => {
    set((state) => {
      const members = state.membersByProgram[programId] || [];
      return {
        membersByProgram: {
          ...state.membersByProgram,
          [programId]: members.map(m => 
            m.odUserId === odUserId ? { ...m, isOnline } : m
          ),
        },
      };
    });
  },
  
  /**
   * Clear data for a specific program
   */
  clearProgram: (programId: string) => {
    set((state) => {
      const { [programId]: _, ...rest } = state.membersByProgram;
      return { membersByProgram: rest };
    });
  },
  
  /**
   * Clear all member state (on logout)
   */
  clearAll: () => {
    set({ membersByProgram: {} });
  },
}));

const EMPTY_MEMBERS: Member[] = [];

// Selector hooks
export const useProgramMembers = (programId: string) =>
  useMemberStore((state) => state.membersByProgram[programId] ?? EMPTY_MEMBERS);
