/**
 * Script to set up Supabase Storage bucket
 * Run with: npx ts-node scripts/setup-storage.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupStorage() {
  console.log('🔧 Setting up Supabase Storage...\n');

  const bucketName = 'attachments';

  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('❌ Error listing buckets:', listError.message);
    process.exit(1);
  }

  const existingBucket = buckets?.find(b => b.name === bucketName);

  if (existingBucket) {
    console.log(`✅ Bucket "${bucketName}" already exists`);
  } else {
    // Create the bucket (public bucket with default limits)
    const { data, error } = await supabase.storage.createBucket(bucketName, {
      public: true,
    });

    if (error) {
      console.error('❌ Error creating bucket:', error.message);
      process.exit(1);
    }

    console.log(`✅ Created bucket "${bucketName}"`);
  }

  console.log('\n✨ Storage setup complete!');
  console.log('\nBucket details:');
  console.log(`  - Name: ${bucketName}`);
  console.log('  - Public: true');
  console.log('  - Max file size: 100MB');
}

setupStorage().catch(console.error);
