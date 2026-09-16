# Multi-Homestay Architecture Implementation

This document details the transformation of the Wangshi-specific HMS into a fully multi-tenant SaaS product.

## 1. Database Changes
- **New Table:** `homestays` (`id`, `name`, `slug`, `location`, `phone`, `email`, `logo_url`, `is_active`, `created_at`).
- **Foreign Keys:** Added `homestay_id` to `partners`, `rooms`, `bookings`, and `guests`.
  - **Safety constraint:** `ON DELETE RESTRICT` is used to prevent accidental cascading deletes of historical business data when a homestay is deactivated.
- **Migration Strategy:** `scripts/migration_multi_homestay_safe.sql` creates the table, seeds "Wangshi Homestay", adds the columns, backfills existing records, and applies `NOT NULL` constraints to rooms, bookings, and guests.

## 2. Row Level Security (RLS) & Security Considerations
- **Tenant Isolation:** RLS policies restrict normal partners to only `SELECT/UPDATE/INSERT/DELETE` rows where the row's `homestay_id` matches their own partner record's `homestay_id`.
- **Super Admin:** Users with `role = 'super_admin'` bypass the homestay filters and have full access to all tables for global management.
- **Guests Security:** The `guests` table now explicitly holds a `homestay_id` column, securing it directly against cross-tenant queries rather than relying solely on JOINs to `bookings`.
- **RPC `create_booking_atomic` Hardening:** The stored procedure no longer blindly trusts the frontend's `p_partner_id`. It extracts `auth.uid()`, fetches the corresponding partner record, and verifies that the booking partner actually has authorization for the requested room's `homestay_id`. The booking inherently inherits the room's `homestay_id`.

## 3. Authentication & State (HMSProvider)
- **Profile Fetching:** `HMSProvider` now intercepts the user session and looks up their `partner` profile and role.
- **Dynamic Homestay Context:** 
  - Normal partners operate strictly within their `homestay_id`.
  - Super Admins load the list of homestays and can toggle a `selectedHomestayId` state to view different tenants in the dashboard.
- **Realtime Safety:** RLS inherently restricts Supabase realtime streams to authorized rows, ensuring no cross-tenant data leakage over WebSockets.

## 4. Admin Architecture (`/admin`)
- A new protected route group `/admin` will be created.
- The layout will verify if the user has `role === 'super_admin'`, throwing an Unauthorized redirect for normal partners.
- **Routes to build:**
  - `/admin` (Overview stats)
  - `/admin/homestays` (List, Add, Deactivate)
  - `/admin/rooms` (Manage rooms globally per homestay)
  - `/admin/partners` (Create users securely without exposing plain passwords, assign to homestays)

## 5. UI De-hardcoding
- The `TopBar` and `Sidebar` will be refactored to consume the `HMSContext` for dynamic branding.
- References to "Wangshi" will dynamically display `homestay.name` or `homestay.logo_url` derived from the active context.

## 6. Migration Instructions
1. Verify no active transactions or heavy loads are occurring.
2. Open the Supabase Dashboard -> SQL Editor.
3. Copy the contents of `scripts/migration_multi_homestay_safe.sql`.
4. Run the script. It is designed to be idempotent and safe on your current Wangshi data.

## 7. Rollback Considerations
If you need to rollback:
- Reverse the `ALTER TABLE` commands for `homestay_id`.
- Drop the `homestays` table.
- Restore the original RLS policies (from a prior backup or reverting the definitions).
- Restore the original `create_booking_atomic` function.
Because we used `RESTRICT` and avoided dropping columns, no data loss will occur during this structural shift.
