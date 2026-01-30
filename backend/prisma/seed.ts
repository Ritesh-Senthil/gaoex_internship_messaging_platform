/**
 * Database Seed Script
 * Creates the Super Admin user and Default Program
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Permission presets (copied from utils to avoid build issues)
const Permissions = {
  ADMINISTRATOR: 1n << 0n,
  MANAGE_PROGRAM: 1n << 1n,
  MANAGE_ROLES: 1n << 2n,
  MANAGE_CHANNELS: 1n << 3n,
  KICK_MEMBERS: 1n << 4n,
  BAN_MEMBERS: 1n << 5n,
  INVITE_MEMBERS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  VIEW_CHANNELS: 1n << 8n,
  SEND_MESSAGES: 1n << 9n,
  SEND_IN_ANNOUNCEMENTS: 1n << 10n,
  EMBED_LINKS: 1n << 11n,
  ATTACH_FILES: 1n << 12n,
  MENTION_EVERYONE: 1n << 13n,
  MENTION_ROLES: 1n << 14n,
  MANAGE_MESSAGES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  CHANGE_NICKNAME: 1n << 17n,
  MANAGE_NICKNAMES: 1n << 18n,
  TIMEOUT_MEMBERS: 1n << 19n,
};

const PermissionPresets = {
  EVERYONE:
    Permissions.VIEW_CHANNELS |
    Permissions.SEND_MESSAGES |
    Permissions.READ_MESSAGE_HISTORY,
  MODERATOR:
    Permissions.MANAGE_CHANNELS |
    Permissions.KICK_MEMBERS |
    Permissions.INVITE_MEMBERS |
    Permissions.VIEW_CHANNELS |
    Permissions.SEND_MESSAGES |
    Permissions.SEND_IN_ANNOUNCEMENTS |
    Permissions.ATTACH_FILES |
    Permissions.MENTION_EVERYONE |
    Permissions.MANAGE_MESSAGES |
    Permissions.READ_MESSAGE_HISTORY |
    Permissions.TIMEOUT_MEMBERS,
};

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Configuration
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@internhub.app';
  const superAdminName = process.env.SUPER_ADMIN_NAME || 'Super Admin';
  const defaultProgramName = process.env.DEFAULT_PROGRAM_NAME || 'Educational Research Group';

  // ============================================
  // 1. Create Super Admin User
  // ============================================
  console.log('👤 Creating Super Admin user...');

  let superAdmin = await prisma.user.findUnique({
    where: { email: superAdminEmail },
  });

  if (!superAdmin) {
    superAdmin = await prisma.user.create({
      data: {
        email: superAdminEmail,
        displayName: superAdminName,
        authProvider: 'GOOGLE',
        authProviderId: `seed-admin-${uuidv4()}`,
        isSuperAdmin: true,
      },
    });
    console.log(`   ✅ Created Super Admin: ${superAdmin.email}`);
  } else {
    // Ensure user is super admin
    if (!superAdmin.isSuperAdmin) {
      await prisma.user.update({
        where: { id: superAdmin.id },
        data: { isSuperAdmin: true },
      });
    }
    console.log(`   ℹ️  Super Admin already exists: ${superAdmin.email}`);
  }

  // ============================================
  // 2. Create Default Program
  // ============================================
  console.log('\n📦 Creating Default Program...');

  let defaultProgram = await prisma.program.findFirst({
    where: { isDefault: true },
  });

  if (!defaultProgram) {
    defaultProgram = await prisma.program.create({
      data: {
        name: defaultProgramName,
        description: 'Welcome to the InternHub community! This is the default program where all members connect.',
        ownerId: superAdmin.id,
        isDefault: true,
        inviteCode: 'WELCOME1',
      },
    });
    console.log(`   ✅ Created Default Program: ${defaultProgram.name}`);
  } else {
    console.log(`   ℹ️  Default Program already exists: ${defaultProgram.name}`);
  }

  // ============================================
  // 3. Create Default Roles
  // ============================================
  console.log('\n🎭 Creating default roles...');

  // @everyone role
  let everyoneRole = await prisma.role.findFirst({
    where: { programId: defaultProgram.id, isEveryone: true },
  });

  if (!everyoneRole) {
    everyoneRole = await prisma.role.create({
      data: {
        programId: defaultProgram.id,
        name: '@everyone',
        color: '#99AAB5',
        position: 0,
        permissions: PermissionPresets.EVERYONE,
        isEveryone: true,
        isMentionable: false,
      },
    });
    console.log('   ✅ Created @everyone role');
  } else {
    console.log('   ℹ️  @everyone role already exists');
  }

  // Moderator role
  let moderatorRole = await prisma.role.findFirst({
    where: { programId: defaultProgram.id, name: 'Moderator' },
  });

  if (!moderatorRole) {
    moderatorRole = await prisma.role.create({
      data: {
        programId: defaultProgram.id,
        name: 'Moderator',
        color: '#3B82F6', // Blue
        position: 1,
        permissions: PermissionPresets.MODERATOR,
        isHoisted: true,
        isMentionable: true,
      },
    });
    console.log('   ✅ Created Moderator role');
  } else {
    console.log('   ℹ️  Moderator role already exists');
  }

  // ============================================
  // 4. Create Default Categories
  // ============================================
  console.log('\n📁 Creating default categories...');

  const categories = [
    { name: 'WELCOME', position: 0 },
    { name: 'GENERAL', position: 1 },
    { name: 'RESOURCES', position: 2 },
  ];

  const createdCategories: Record<string, string> = {};

  for (const cat of categories) {
    let category = await prisma.category.findFirst({
      where: { programId: defaultProgram.id, name: cat.name },
    });

    if (!category) {
      category = await prisma.category.create({
        data: {
          programId: defaultProgram.id,
          name: cat.name,
          position: cat.position,
        },
      });
      console.log(`   ✅ Created category: ${cat.name}`);
    } else {
      console.log(`   ℹ️  Category already exists: ${cat.name}`);
    }

    createdCategories[cat.name] = category.id;
  }

  // ============================================
  // 5. Create Default Channels
  // ============================================
  console.log('\n💬 Creating default channels...');

  const channels = [
    { name: 'welcome', categoryName: 'WELCOME', type: 'TEXT' as const, position: 0, topic: 'Introduce yourself to the community!' },
    { name: 'announcements', categoryName: 'WELCOME', type: 'ANNOUNCEMENT' as const, position: 1, topic: 'Official announcements and updates' },
    { name: 'general', categoryName: 'GENERAL', type: 'TEXT' as const, position: 0, topic: 'General discussion' },
    { name: 'questions', categoryName: 'GENERAL', type: 'TEXT' as const, position: 1, topic: 'Ask questions and get help' },
    { name: 'resources', categoryName: 'RESOURCES', type: 'TEXT' as const, position: 0, topic: 'Shared learning materials and links' },
    { name: 'opportunities', categoryName: 'RESOURCES', type: 'TEXT' as const, position: 1, topic: 'Job postings and internship openings' },
  ];

  for (const ch of channels) {
    const existing = await prisma.channel.findFirst({
      where: { programId: defaultProgram.id, name: ch.name },
    });

    if (!existing) {
      await prisma.channel.create({
        data: {
          programId: defaultProgram.id,
          categoryId: createdCategories[ch.categoryName],
          name: ch.name,
          topic: ch.topic,
          type: ch.type,
          position: ch.position,
          createdById: superAdmin.id,
        },
      });
      console.log(`   ✅ Created channel: #${ch.name}`);
    } else {
      console.log(`   ℹ️  Channel already exists: #${ch.name}`);
    }
  }

  // ============================================
  // 6. Add Super Admin to Default Program
  // ============================================
  console.log('\n🔗 Adding Super Admin to Default Program...');

  let membership = await prisma.programMembership.findUnique({
    where: {
      userId_programId: {
        userId: superAdmin.id,
        programId: defaultProgram.id,
      },
    },
  });

  if (!membership) {
    membership = await prisma.programMembership.create({
      data: {
        userId: superAdmin.id,
        programId: defaultProgram.id,
      },
    });
    console.log('   ✅ Added Super Admin to Default Program');
  } else {
    console.log('   ℹ️  Super Admin already in Default Program');
  }

  // Assign @everyone role
  const memberRole = await prisma.memberRole.findFirst({
    where: {
      membershipId: membership.id,
      roleId: everyoneRole.id,
    },
  });

  if (!memberRole) {
    await prisma.memberRole.create({
      data: {
        membershipId: membership.id,
        roleId: everyoneRole.id,
      },
    });
    console.log('   ✅ Assigned @everyone role to Super Admin');
  }

  // Assign Moderator role
  const modMemberRole = await prisma.memberRole.findFirst({
    where: {
      membershipId: membership.id,
      roleId: moderatorRole.id,
    },
  });

  if (!modMemberRole) {
    await prisma.memberRole.create({
      data: {
        membershipId: membership.id,
        roleId: moderatorRole.id,
      },
    });
    console.log('   ✅ Assigned Moderator role to Super Admin');
  }

  // ============================================
  // Done!
  // ============================================
  console.log('\n✨ Database seed completed successfully!\n');
  console.log('Summary:');
  console.log(`   Super Admin: ${superAdmin.email}`);
  console.log(`   Default Program: ${defaultProgram.name}`);
  console.log(`   Invite Code: ${defaultProgram.inviteCode}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
