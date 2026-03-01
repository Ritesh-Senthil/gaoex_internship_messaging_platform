/**
 * InternHub Permission System
 * Simplified bitfield permissions for role-based access control
 *
 * 10 permissions across 2 categories (Program, Channel).
 * Bit positions are preserved from the original 20-permission set for
 * backwards-compatible BigInt storage — removed bits are simply ignored.
 */

// Permission bit flags (using BigInt for 64-bit support)
export const Permissions = {
  // Program Management
  ADMINISTRATOR: 1n << 0n,          // Full access, bypasses all checks
  MANAGE_PROGRAM: 1n << 1n,         // Edit program name, description, settings
  MANAGE_ROLES: 1n << 2n,           // Create, edit, delete roles
  MANAGE_CHANNELS: 1n << 3n,        // Create, edit, delete channels/categories
  INVITE_MEMBERS: 1n << 6n,         // Create and share invite links

  // Channel Permissions
  SEND_MESSAGES: 1n << 9n,          // Post messages in text channels
  SEND_IN_ANNOUNCEMENTS: 1n << 10n, // Post in announcement channels
  ATTACH_FILES: 1n << 12n,          // Upload files and images
  MENTION_EVERYONE: 1n << 13n,      // Use @everyone and @here
  MANAGE_MESSAGES: 1n << 15n,       // Delete or pin any message
} as const;

// Type for permission keys
export type PermissionKey = keyof typeof Permissions;

// Combined permission presets for role templates
export const PermissionPresets = {
  // @everyone role — basic messaging
  EVERYONE:
    Permissions.SEND_MESSAGES,

  // Student role — standard member
  STUDENT:
    Permissions.SEND_MESSAGES |
    Permissions.ATTACH_FILES,

  // Facilitator role — elevated member
  FACILITATOR:
    Permissions.MANAGE_CHANNELS |
    Permissions.INVITE_MEMBERS |
    Permissions.SEND_MESSAGES |
    Permissions.SEND_IN_ANNOUNCEMENTS |
    Permissions.ATTACH_FILES |
    Permissions.MENTION_EVERYONE |
    Permissions.MANAGE_MESSAGES,

  // All permissions (for reference, not typically used directly)
  ALL: Object.values(Permissions).reduce((acc, perm) => acc | perm, 0n),
} as const;

/**
 * Check if a permission bitfield has a specific permission
 */
export function hasPermission(permissions: bigint, permission: bigint): boolean {
  // Administrator bypasses all permission checks
  if ((permissions & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) {
    return true;
  }
  return (permissions & permission) === permission;
}

/**
 * Check if a permission bitfield has any of the specified permissions
 */
export function hasAnyPermission(permissions: bigint, ...permissionsToCheck: bigint[]): boolean {
  if ((permissions & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) {
    return true;
  }
  return permissionsToCheck.some(perm => (permissions & perm) === perm);
}

/**
 * Check if a permission bitfield has all of the specified permissions
 */
export function hasAllPermissions(permissions: bigint, ...permissionsToCheck: bigint[]): boolean {
  if ((permissions & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) {
    return true;
  }
  return permissionsToCheck.every(perm => (permissions & perm) === perm);
}

/**
 * Add permissions to a bitfield
 */
export function addPermissions(permissions: bigint, ...permissionsToAdd: bigint[]): bigint {
  return permissionsToAdd.reduce((acc, perm) => acc | perm, permissions);
}

/**
 * Remove permissions from a bitfield
 */
export function removePermissions(permissions: bigint, ...permissionsToRemove: bigint[]): bigint {
  return permissionsToRemove.reduce((acc, perm) => acc & ~perm, permissions);
}

/**
 * Compute effective permissions from role permissions and channel overrides
 */
export function computePermissions(
  basePermissions: bigint,
  categoryAllow: bigint = 0n,
  categoryDeny: bigint = 0n,
  channelAllow: bigint = 0n,
  channelDeny: bigint = 0n
): bigint {
  // Administrator bypasses all
  if ((basePermissions & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) {
    return PermissionPresets.ALL;
  }

  // Apply category overrides
  let permissions = (basePermissions & ~categoryDeny) | categoryAllow;
  
  // Apply channel overrides (takes precedence)
  permissions = (permissions & ~channelDeny) | channelAllow;

  return permissions;
}

/**
 * Combine permissions from multiple roles (additive)
 */
export function combineRolePermissions(rolePermissions: bigint[]): bigint {
  return rolePermissions.reduce((acc, perm) => acc | perm, 0n);
}

/**
 * Get array of permission names from a bitfield
 */
export function getPermissionNames(permissions: bigint): PermissionKey[] {
  return (Object.entries(Permissions) as [PermissionKey, bigint][])
    .filter(([_, value]) => (permissions & value) === value)
    .map(([key]) => key);
}

/**
 * Create permission bitfield from array of permission names
 */
export function createPermissionBitfield(permissionNames: PermissionKey[]): bigint {
  return permissionNames.reduce((acc, name) => {
    const perm = Permissions[name];
    return perm ? acc | perm : acc;
  }, 0n);
}

/**
 * Convert bigint to string for JSON serialization
 */
export function permissionsToString(permissions: bigint): string {
  return permissions.toString();
}

/**
 * Convert string back to bigint
 */
export function stringToPermissions(str: string): bigint {
  return BigInt(str);
}
