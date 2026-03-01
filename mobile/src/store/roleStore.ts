/**
 * Role Store using Zustand
 * Manages role list state for real-time updates
 */

import { create } from 'zustand';

interface Role {
  id: string;
  name: string;
  color?: string | null;
  tier: number;
  permissions: string; // BigInt as string
  memberCount?: number;
  isDefault?: boolean;
  createdAt?: string;
}

interface RoleState {
  // State - organized by program
  rolesByProgram: Record<string, Role[]>; // programId -> roles
  
  // Actions
  setRoles: (programId: string, roles: Role[]) => void;
  addRole: (programId: string, role: Role) => void;
  updateRole: (programId: string, roleId: string, updates: Partial<Role>) => void;
  removeRole: (programId: string, roleId: string) => void;
  updateRoleMemberCount: (programId: string, roleId: string, delta: number) => void;
  
  // Utility
  clearProgram: (programId: string) => void;
  clearAll: () => void;
}

export const useRoleStore = create<RoleState>((set) => ({
  // Initial state
  rolesByProgram: {},
  
  /**
   * Set all roles for a program (from API)
   */
  setRoles: (programId: string, roles: Role[]) => {
    set((state) => ({
      rolesByProgram: {
        ...state.rolesByProgram,
        [programId]: roles,
      },
    }));
  },
  
  /**
   * Add a new role to a program
   */
  addRole: (programId: string, role: Role) => {
    set((state) => {
      const roles = state.rolesByProgram[programId] || [];
      // Check if role already exists
      if (roles.some(r => r.id === role.id)) {
        return state;
      }
      return {
        rolesByProgram: {
          ...state.rolesByProgram,
          [programId]: [...roles, role],
        },
      };
    });
  },
  
  /**
   * Update an existing role
   */
  updateRole: (programId: string, roleId: string, updates: Partial<Role>) => {
    set((state) => {
      const roles = state.rolesByProgram[programId] || [];
      return {
        rolesByProgram: {
          ...state.rolesByProgram,
          [programId]: roles.map(r => 
            r.id === roleId ? { ...r, ...updates } : r
          ),
        },
      };
    });
  },
  
  /**
   * Remove a role from a program
   */
  removeRole: (programId: string, roleId: string) => {
    set((state) => {
      const roles = state.rolesByProgram[programId] || [];
      return {
        rolesByProgram: {
          ...state.rolesByProgram,
          [programId]: roles.filter(r => r.id !== roleId),
        },
      };
    });
  },
  
  /**
   * Update role member count (increment/decrement)
   */
  updateRoleMemberCount: (programId: string, roleId: string, delta: number) => {
    set((state) => {
      const roles = state.rolesByProgram[programId] || [];
      return {
        rolesByProgram: {
          ...state.rolesByProgram,
          [programId]: roles.map(r => 
            r.id === roleId 
              ? { ...r, memberCount: Math.max(0, (r.memberCount || 0) + delta) } 
              : r
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
      const { [programId]: _, ...rest } = state.rolesByProgram;
      return { rolesByProgram: rest };
    });
  },
  
  /**
   * Clear all role state (on logout)
   */
  clearAll: () => {
    set({ rolesByProgram: {} });
  },
}));

// Selector hooks
export const useProgramRoles = (programId: string) => 
  useRoleStore((state) => state.rolesByProgram[programId] || []);
