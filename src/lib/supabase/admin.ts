import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }

  // Handle both standard key names, trimming any stray whitespace/newlines
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  );

  if (!secretKey) {
    throw new Error(
      "Supabase Admin client secret key is missing. Please configure SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in your environment variables."
    );
  }

  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ''
  );

  // Guard against accidentally using the public/anonymous key for admin operations
  if (secretKey === anonKey || secretKey.startsWith('sb_publishable_')) {
    throw new Error(
      "Supabase Admin client cannot use the public/anonymous key. Please configure a valid secret/service-role key (e.g. sb_secret_... or service_role secret)."
    );
  }

  if (secretKey.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(secretKey.split('.')[1], 'base64').toString('utf8'));
      if (payload.role === 'anon') {
        throw new Error(
          "Supabase Admin client cannot use the public/anonymous key (detected anon role). Please configure a valid service_role key."
        );
      }
    } catch (e: any) {
      if (e.message?.includes('Supabase Admin client')) throw e;
    }
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
