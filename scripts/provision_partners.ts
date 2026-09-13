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

// Actual partner details provided by the user
const partnersToProvision = [
  // ✅ Successfully provisioned:
  // { name: 'UG Marketing', email: 'ugmarketing01@gmail.com' },
  // { name: 'Riya Sharma', email: 'riyasharma2003121@gmail.com' },
  
  // ⏳ Failed due to rate limit, try again later:
  { name: 'Octavium', email: 'octavium4@gmail.com' }
];

async function provisionPartners() {
  console.log('🚀 Starting secure partner provisioning...\n');

  for (const partner of partnersToProvision) {
    if (partner.email.includes('example.com')) {
      console.error(`⚠️ Skipping ${partner.name}: Please provide real email addresses before running.`);
      continue;
    }

    console.log(`⏳ Provisioning: ${partner.name} (${partner.email})`);

    // 1. Invite user via Supabase Auth Admin
    const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(partner.email, {
      data: { name: partner.name }
    });

    if (authError) {
      console.error(`❌ Failed to invite user ${partner.email}:`, authError.message);
      continue;
    }

    const authUserId = authData.user.id;
    console.log(`✅ Invited securely. Auth ID: ${authUserId}`);

    // 2. Insert into the partners table
    const { error: dbError } = await supabase
      .from('partners')
      .insert({
        name: partner.name,
        email: partner.email,
        auth_user_id: authUserId,
        role: 'partner',
        is_active: true
      });

    if (dbError) {
      if (dbError.code === '23505') { // Unique violation
        console.log(`⚠️ Partner record already exists for ${partner.email}. Updating auth_user_id...`);
        // Attempt to link it if it already exists
        const { error: updateError } = await supabase
          .from('partners')
          .update({ auth_user_id: authUserId, is_active: true })
          .eq('email', partner.email);
        
        if (updateError) {
          console.error(`❌ Failed to update partner record:`, updateError.message);
        } else {
          console.log(`✅ Partner record linked successfully.`);
        }
      } else {
        console.error(`❌ Failed to create partner record for ${partner.email}:`, dbError.message);
      }
    } else {
      console.log(`✅ Partner record created successfully.`);
    }
    
    console.log('--------------------------------------------------');
  }

  console.log('\n🎉 Provisioning complete!');
}

provisionPartners().catch(console.error);
