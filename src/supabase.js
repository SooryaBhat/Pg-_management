import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase env vars. Check your .env file.');
}

// Single Supabase client instance — used ONLY for Storage
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Upload a file to Supabase Storage and return its public URL.
 *
 * @param {string} bucket     - Bucket name: 'chat-media' | 'payment-screenshots'
 * @param {string} folder     - Sub-folder path, e.g. 'images/uid123' or 'audio/uid123'
 * @param {File}   file       - The File or Blob to upload
 * @param {string} [mimeType] - Override MIME type (useful for blobs)
 * @returns {Promise<string>} - Public URL of the uploaded file
 */
export async function uploadToSupabase(bucket, folder, file, mimeType) {
  const ext = file.name
    ? file.name.split('.').pop()
    : mimeType === 'audio/webm' ? 'webm' : 'bin';

  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${folder}/${fileName}`;

  const uploadFile = mimeType
    ? new File([file], fileName, { type: mimeType })
    : file;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, uploadFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: mimeType || file.type || 'application/octet-stream',
    });

  if (error) {
    console.error('Supabase upload error:', error);
    throw new Error(error.message || 'Upload failed');
  }

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}
