import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load environment variables manually
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testBooking() {
  console.log('🧪 Starting Booking Test...\n');

  // 1. Log in as UG Marketing
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'ugmarketing01@gmail.com',
    password: 'unmesh'
  });

  if (authError) {
    console.error("❌ Login failed:", authError.message);
    return;
  }
  
  console.log(`✅ Logged in as ${authData.user.email}`);

  // 2. Get the partner ID
  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('email', authData.user.email)
    .single();

  const room1UUID = 'cabf8119-6326-4d63-994d-3de1cdc33ddc';

  // 3. Attempt Booking 1
  console.log(`\n⏳ Attempting first booking for Room No. 1...`);
  const { data: booking1, error: booking1Error } = await supabase.rpc('create_booking_atomic', {
    p_room_id: room1UUID,
    p_partner_id: partner!.id,
    p_check_in: '2026-09-13',
    p_check_out: '2026-09-17',
    p_number_of_guests: 1,
    p_notes: 'Test Booking',
    p_guests: []
  });

  if (booking1Error) {
    console.error("❌ First booking failed:", booking1Error.message);
  } else {
    console.log("✅ First booking succeeded! Booking ID:", booking1);
  }

  // 4. Attempt Booking 2 (Same Dates - Overlapping)
  console.log(`\n⏳ Attempting overlapping double-booking for Room No. 1...`);
  const { data: booking2, error: booking2Error } = await supabase.rpc('create_booking_atomic', {
    p_room_id: room1UUID,
    p_partner_id: partner!.id,
    p_check_in: '2026-09-13',
    p_check_out: '2026-09-17',
    p_number_of_guests: 1,
    p_notes: 'Test Double Booking',
    p_guests: []
  });

  if (booking2Error) {
    console.log("✅ Double-booking was correctly rejected by Supabase!");
    console.log("   Error message:", booking2Error.message);
  } else {
    console.error("❌ CRITICAL SECURITY FAILURE: Double-booking succeeded! ID:", booking2);
  }
}

testBooking().catch(console.error);
