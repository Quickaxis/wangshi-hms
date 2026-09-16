import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const secretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  
  if (!secretKey) {
    console.warn("SUPABASE_SECRET_KEY is not set. Admin operations will fail.");
  }
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    secretKey || 'dummy-key'
  )
}
