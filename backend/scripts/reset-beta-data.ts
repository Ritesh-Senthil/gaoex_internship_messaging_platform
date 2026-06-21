/**
 * Reset messaging & test data for a clean beta environment.
 *
 * Keeps: User accounts (Google sign-in), default program structure (channels/roles).
 * Clears: All messages/DMs, reactions, attachments, conversations, read state,
 *         join requests, invites, push tokens, refresh tokens, non-default programs,
 *         Supabase attachment files.
 *
 * Usage:
 *   CONFIRM_RESET_BETA=yes npx ts-node scripts/reset-beta-data.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const BUCKET = 'attachments';

type Tx = Prisma.TransactionClient;

async function deleteAllMessages(tx: Tx): Promise<number> {
  await tx.messageReaction.deleteMany();
  await tx.attachment.deleteMany();

  let total = 0;
  for (;;) {
    const batch = await tx.message.deleteMany({
      where: { replies: { none: {} } },
    });
    total += batch.count;
    if (batch.count === 0) break;
  }
  return total;
}

async function clearStorageFiles(): Promise<number> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('   ⚠️  Skipping storage cleanup (SUPABASE_URL / SUPABASE_SERVICE_KEY not set)');
    return 0;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let removed = 0;

  async function removePrefix(prefix: string): Promise<void> {
    const { data: entries, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      console.warn(`   ⚠️  Storage list failed (${prefix || 'root'}):`, error.message);
      return;
    }
    if (!entries?.length) return;

    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
        if (!rmErr) removed += 1;
      } else {
        await removePrefix(path);
      }
    }
  }

  await removePrefix('');
  return removed;
}

async function main() {
  if (process.env.CONFIRM_RESET_BETA !== 'yes') {
    console.error('❌ Refusing to run without CONFIRM_RESET_BETA=yes');
    console.error('   Example: CONFIRM_RESET_BETA=yes npx ts-node scripts/reset-beta-data.ts');
    process.exit(1);
  }

  const dbHost = process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] ?? 'unknown';
  console.log('🧹 Beta data reset starting…');
  console.log(`   Database host: ${dbHost}\n`);

  const stats = await prisma.$transaction(async tx => {
    const messages = await deleteAllMessages(tx);
    const participants = await tx.conversationParticipant.deleteMany();
    const conversations = await tx.conversation.deleteMany();
    const channelReads = await tx.channelRead.deleteMany();
    const joinRequests = await tx.joinRequest.deleteMany();
    const invites = await tx.invite.deleteMany();
    const pushTokens = await tx.pushToken.deleteMany();
    const refreshTokens = await tx.refreshToken.deleteMany();
    const nonDefaultPrograms = await tx.program.deleteMany({
      where: { isDefault: false },
    });

    return {
      messages,
      participants: participants.count,
      conversations: conversations.count,
      channelReads: channelReads.count,
      joinRequests: joinRequests.count,
      invites: invites.count,
      pushTokens: pushTokens.count,
      refreshTokens: refreshTokens.count,
      nonDefaultPrograms: nonDefaultPrograms.count,
    };
  });

  console.log('📊 Database cleanup:');
  console.log(`   Messages removed:          ${stats.messages}`);
  console.log(`   Conversations removed:     ${stats.conversations}`);
  console.log(`   DM participants removed:   ${stats.participants}`);
  console.log(`   Channel read rows cleared: ${stats.channelReads}`);
  console.log(`   Join requests cleared:     ${stats.joinRequests}`);
  console.log(`   Invites cleared:           ${stats.invites}`);
  console.log(`   Push tokens cleared:       ${stats.pushTokens}`);
  console.log(`   Refresh tokens cleared:    ${stats.refreshTokens}`);
  console.log(`   Non-default programs:      ${stats.nonDefaultPrograms} deleted`);
  console.log('   Users & default program channels/roles preserved\n');

  console.log('🗄️  Clearing Supabase attachment files…');
  const storageRemoved = await clearStorageFiles();
  console.log(`   Storage objects removed:   ${storageRemoved}\n`);

  console.log('✨ Beta reset complete.');
  console.log('   Testers must sign in again. Channels/DMs start empty.');
  console.log('   Default program invite code: WELCOME1 (unless changed in DB).\n');
}

main()
  .catch(err => {
    console.error('❌ Reset failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
