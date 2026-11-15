/**
 * Supabase Client Configuration
 * Used for file storage operations
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️ Supabase credentials not configured. File uploads will not work.');
}

// Create Supabase client with service role key for server-side operations
export const supabase = createClient(
  supabaseUrl || '',
  supabaseServiceKey || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Storage bucket name
export const STORAGE_BUCKET = 'attachments';

// Allowed file types and their MIME types
export const ALLOWED_FILE_TYPES = {
  // Images
  'image/jpeg': { ext: 'jpg', maxSize: 10 * 1024 * 1024 }, // 10MB
  'image/jpg': { ext: 'jpg', maxSize: 10 * 1024 * 1024 }, // Alternative MIME type
  'image/png': { ext: 'png', maxSize: 10 * 1024 * 1024 },
  'image/gif': { ext: 'gif', maxSize: 10 * 1024 * 1024 },
  'image/webp': { ext: 'webp', maxSize: 10 * 1024 * 1024 },
  'image/heic': { ext: 'heic', maxSize: 10 * 1024 * 1024 }, // iPhone format
  'image/heif': { ext: 'heif', maxSize: 10 * 1024 * 1024 }, // iPhone format
  
  // Documents
  'application/pdf': { ext: 'pdf', maxSize: 25 * 1024 * 1024 }, // 25MB
  'application/msword': { ext: 'doc', maxSize: 25 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', maxSize: 25 * 1024 * 1024 },
  'application/vnd.ms-excel': { ext: 'xls', maxSize: 25 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', maxSize: 25 * 1024 * 1024 },
  'application/vnd.ms-powerpoint': { ext: 'ppt', maxSize: 50 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', maxSize: 50 * 1024 * 1024 },
  'text/plain': { ext: 'txt', maxSize: 5 * 1024 * 1024 }, // 5MB
  'text/csv': { ext: 'csv', maxSize: 10 * 1024 * 1024 }, // 10MB
  'application/json': { ext: 'json', maxSize: 5 * 1024 * 1024 },
  
  // Videos
  'video/mp4': { ext: 'mp4', maxSize: 100 * 1024 * 1024 }, // 100MB
  'video/webm': { ext: 'webm', maxSize: 100 * 1024 * 1024 },
  'video/quicktime': { ext: 'mov', maxSize: 100 * 1024 * 1024 },
  
  // Audio
  'audio/mpeg': { ext: 'mp3', maxSize: 25 * 1024 * 1024 }, // 25MB
  'audio/wav': { ext: 'wav', maxSize: 25 * 1024 * 1024 },
  'audio/ogg': { ext: 'ogg', maxSize: 25 * 1024 * 1024 },
};

// Max files per message
export const MAX_FILES_PER_MESSAGE = 5;

// Get file type category
export function getFileCategory(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

/** Storage path inside the attachments bucket, parsed from a public or signed URL. */
export function storagePathFromFileUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    const publicMarker = '/storage/v1/object/public/';
    const signedMarker = '/storage/v1/object/sign/';
    const marker = url.pathname.includes(publicMarker)
      ? publicMarker
      : url.pathname.includes(signedMarker)
        ? signedMarker
        : null;
    if (!marker) return null;
    const rest = decodeURIComponent(url.pathname.split(marker)[1] || '');
    const prefix = `${STORAGE_BUCKET}/`;
    if (!rest.startsWith(prefix)) return null;
    return rest.slice(prefix.length).split('?')[0];
  } catch {
    return null;
  }
}

/** Signed URL for a stored file. The original URL is kept when signing is unavailable. */
export async function signFileUrl(fileUrl: string): Promise<string> {
  const path = storagePathFromFileUrl(fileUrl);
  if (!path || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return fileUrl;
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return fileUrl;
  return data.signedUrl;
}

export async function signAttachments<T extends { fileUrl: string }>(attachments: T[]): Promise<T[]> {
  if (attachments.length === 0) return attachments;
  return Promise.all(attachments.map(async (attachment) => ({
    ...attachment,
    fileUrl: await signFileUrl(attachment.fileUrl),
  })));
}

// Generate storage path for a file
export function generateStoragePath(
  context: 'channel' | 'dm',
  contextId: string,
  userId: string,
  fileName: string
): string {
  const timestamp = Date.now();
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${context}/${contextId}/${userId}/${timestamp}_${safeFileName}`;
}
