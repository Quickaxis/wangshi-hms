import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
      value = value.replace(/\\n/gm, '\n');
    }
    env[key] = value.replace(/(^['"]|['"]$)/g, '').trim();
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

// Strictly use Anon Key to enforce RLS
const supabase = createClient(supabaseUrl, supabaseKey);

async function testBooking() {
  // Login as UG Marketing to test RLS
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'UG Marketing@gmail.com', // wait, is this the email? The user prompt said: DO NOT use "UG Marketing@gmail.com" as partner_id. But maybe it's the login email?
    password: 'password123' // I'll assume standard test password or I'll just check the db
  });

  if (authError) {
    console.error("Auth error:", authError);
    // If auth fails, try to fetch the first user using the service key just to get a session
  } else {
    console.log("Authenticated as:", authData.user.email);
  }

  console.log("Fetching a room...");
  const { data: room, error: roomError } = await supabase.from('rooms').select('id, name').limit(1).single();
  if (roomError) {
    console.error("Room fetch error:", roomError);
    return;
  }
  console.log("Room ID:", room.id, room.name);

  console.log("Fetching a partner...");
  const { data: partner, error: partnerError } = await supabase.from('partners').select('id, name, auth_user_id').limit(1).single();
  if (partnerError) {
    console.error("Partner fetch error:", partnerError);
    return;
  }
  console.log("Partner ID:", partner.id, partner.name, partner.auth_user_id);

  console.log("Calling create_booking_atomic...");
  
  const payload = {
    p_room_id: room.id,
    p_partner_id: partner.id,
    p_check_in: '2026-09-22',
    p_check_out: '2026-09-23',
    p_number_of_guests: 1,
    p_notes: 'Test note'
  };

  console.log("Payload:", payload);

  const { data, error } = await supabase.rpc('create_booking_atomic', payload);

  if (error) {
    console.error("RPC Error Details:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
  } else {
    console.log("RPC Success! Booking ID:", data);

    console.log("Testing guest insertion...");
    const { error: guestError } = await supabase.from('guests').insert([{
      booking_id: data,
      name: 'Test Guest',
      phone: '9999999999',
      is_primary: true
    }]);

    if (guestError) {
      console.error("Guest Insertion Error Details:", {
        code: guestError.code,
        message: guestError.message,
        details: guestError.details,
        hint: guestError.hint
      });
    } else {
      console.log("Guest inserted successfully!");
    }
  }
}

testBooking();
