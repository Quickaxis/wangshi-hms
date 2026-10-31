import 'server-only';
import { createClient } from '@supabase/supabase-js';

const cleanString = (val?: string) => (val || '').replace(/^["']|["']$/g, '').trim();

export interface EnvVarStatus {
  present: boolean;
  trimmed: boolean;
  nonEmpty: boolean;
}

export interface AdminEnvDiagnostic {
  supabaseUrl: EnvVarStatus;
  serviceRoleKey: EnvVarStatus;
  secretKeyFallback: EnvVarStatus;
  publishableKey: EnvVarStatus;
  isReady: boolean;
  issue?: string;
}

/**
 * Safe server-side diagnostic: returns strictly boolean metadata on environment variables.
 * Never logs or exposes values, characters, or prefixes.
 */
export function getAdminEnvDiagnostic(): AdminEnvDiagnostic {
  const checkVar = (raw: string | undefined): EnvVarStatus => ({
    present: raw !== undefined,
    trimmed: raw !== undefined ? raw === raw.trim() : false,
    nonEmpty: raw !== undefined ? cleanString(raw).length > 0 : false,
  });

  const supabaseUrl = checkVar(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = checkVar(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const secretKeyFallback = checkVar(process.env.SUPABASE_SECRET_KEY);
  const publishableKey = checkVar(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const anonVal = cleanString(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const secretVal = cleanString(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);

  let isReady = false;
  let issue: string | undefined;

  if (!supabaseUrl.nonEmpty) {
    issue = "NEXT_PUBLIC_SUPABASE_URL is missing or empty.";
  } else if (!serviceRoleKey.nonEmpty && !secretKeyFallback.nonEmpty) {
    issue = "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) is missing or empty.";
  } else if (anonVal && secretVal && anonVal === secretVal) {
    issue = "SUPABASE_SERVICE_ROLE_KEY is identical to the public anonymous key.";
  } else {
    isReady = true;
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    secretKeyFallback,
    publishableKey,
    isReady,
    issue,
  };
}

export function createAdminClient() {
  const supabaseUrl = cleanString(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }

  // Handle both standard key names, trimming any stray whitespace, quotes, or newlines
  const secretKey = (
    cleanString(process.env.SUPABASE_SECRET_KEY) ||
    cleanString(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    ''
  );

  if (!secretKey) {
    throw new Error(
      "Supabase Admin client secret key is missing. Please configure SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in your environment variables."
    );
  }

  const anonKey = (
    cleanString(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    cleanString(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
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
