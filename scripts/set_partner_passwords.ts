import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load environment variables manually from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase URL or Service Role Key in .env.local");
  process.exit(1);
}

// Create Supabase client with the service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Configure the new passwords here. 
// Do NOT commit this file to version control if it contains real passwords.
const passwordsToSet = [
  { email: 'ugmarketing01@gmail.com', newPassword: 'unmesh' },
  { email: 'riyasharma2003121@gmail.com', newPassword: 'riya' },
  { email: 'octavium4@gmail.com', newPassword: 'octavium' }
];

async function setPasswords() {
  console.log('🚀 Starting admin password setup...\n');

  for (const { email, newPassword } of passwordsToSet) {
    console.log(`⏳ Looking up user: ${email}`);

    // 1. Find the user ID by email using the Admin API
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error(`❌ Failed to list users:`, listError.message);
      return;
    }

    const user = users.find(u => u.email === email);

    if (!user) {
      console.error(`❌ User ${email} not found in Supabase Auth. Have they been provisioned?`);
      continue;
    }

    console.log(`✅ Found user ID: ${user.id}. Setting password...`);

    // 2. Force update the user's password securely
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
      email_confirm: true // Force confirm their email just in case
    });

    if (updateError) {
      console.error(`❌ Failed to set password for ${email}:`, updateError.message);
    } else {
      console.log(`🎉 Successfully set new password for ${email}.`);
    }

    console.log('--------------------------------------------------');
  }

  console.log('\n✅ Password setup complete! The partners can now log in directly at /login.');
}

setPasswords().catch(console.error);
