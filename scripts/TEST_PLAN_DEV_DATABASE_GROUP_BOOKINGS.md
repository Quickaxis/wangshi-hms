# Development Database Integration Test Plan: Multi-Room Booking & Consolidated Invoicing

## 1. Overview & Objectives

This document specifies the integration testing strategy and verification protocols for the **Multi-Room Booking and Consolidated Invoicing** feature within the Homestay Management System (HMS).

The goal is to prove, on a real PostgreSQL / Supabase development engine, that:
1. Single-room and multi-room bookings create accurate booking records with proper group linkages.
2. Concurrent booking attempts for the same room are serialized via row-level locks, preventing double bookings.
3. If any room in a multi-room request is unavailable, the entire transaction is rolled back atomically.
4. A single consolidated invoice can be generated containing line items for all reserved rooms.
5. Duplicate active invoices for the same group are strictly prevented at the database storage engine level.
6. Payments accurately reconcile against consolidated invoices through the immutable payments ledger.
7. Cancelling a single room releases that room's inventory without corrupting sibling reservations or invoice history.
8. Rollback migration cleanly restores the Phase 2 database state.

---

## 2. Safety Rules & Production Isolation

> [!CAUTION]
> **Production Guard:**
> Integration tests must **NEVER** run against the production database (`algorrnjotffcvtinbyy` / `*.supabase.co`).
> Test scripts enforce hardcoded connection-string assertions that reject any remote production host.

- Tests run exclusively against:
  1. A local disposable PostgreSQL 18 cluster (spawned in `$env:TEMP` and torn down after execution), OR
  2. A dedicated local/staging development PostgreSQL instance (`127.0.0.1` / `localhost`).
- `.env.local`, production storage, and git history remain untouched.

---

## 3. Integration Scenarios & Verification Matrix

| # | Scenario | Mechanism Tested | Expected Result |
|---|---|---|---|
| **1** | **Single-Room Booking** | `create_group_booking_atomic` with 1 room | Creates 1 booking row with `is_group_lead = true`, generates `group_id`, locks room. |
| **2** | **Multi-Room Group Booking** | `create_group_booking_atomic` with 3 rooms | Creates 3 booking rows sharing identical `group_id`, exactly 1 has `is_group_lead = true`. Total equals sum of rooms. |
| **3** | **Concurrent Booking Attempts** | Two parallel DB connections booking same room | Canonical `FOR UPDATE` lock acquisition serializes requests; Client A succeeds, Client B gets `ROOM_UNAVAILABLE`. |
| **4** | **Atomic Rollback on Unavailability** | 3-room booking where 1 room is already booked | Transaction aborts with `ROOM_UNAVAILABLE`; 0 booking rows created for the other 2 rooms. |
| **5** | **Consolidated Invoice Creation** | `create_invoice_with_items` with group lead booking | Single invoice created with `group_id` matching group; 3 line items created; grand total matches sum of rooms. |
| **6** | **Duplicate Invoice Prevention** | Unique partial index `uq_invoices_active_group` + RPC pre-check | Attempting a second active invoice for the group throws error `DUPLICATE_GROUP_INVOICE` / code `23505`. |
| **7** | **Partial Payments & Ledger Triggers** | `record_invoice_payment` + `trg_sync_invoice_from_payments` | Recording ₹5,000 updates invoice `amount_paid = 5000`, `balance_due = 10000`, status `'partially_paid'`. Final ₹10,000 marks `'paid'`. |
| **8** | **Room-Level Cancellation** | `UPDATE bookings SET status = 'cancelled'` on 1 room | Target room marked `'cancelled'`; sibling rooms remain `'confirmed'`; cancelled room immediately rebookable. |
| **9** | **Rollback Migration Safety** | `migration_group_bookings_rollback.sql` | `create_invoice_with_items` restored to Phase 2; indexes and `group_id` columns dropped without orphan errors. |

---

## 4. Detailed Scenario Walkthroughs

### Scenario 1: Single-Room Booking
- **Action:** Call `create_group_booking_atomic(ARRAY[room1], partner_id, '2026-12-01', '2026-12-03', 2, 'Note', '[{...primary guest...}]')`.
- **Database Checks:**
  - `bookings` table has 1 new row.
  - `group_id` is NOT NULL (UUID).
  - `is_group_lead` is `true`.
  - Room 101 availability is blocked for `2026-12-01` to `2026-12-03`.

### Scenario 2: Multi-Room Group Booking
- **Action:** Call `create_group_booking_atomic(ARRAY[room1, room2, room3], partner_id, '2026-12-10', '2026-12-12', 4, 'Note', '[{...primary guest...}]')`.
- **Database Checks:**
  - `bookings` table has 3 rows sharing the exact same `group_id`.
  - `SELECT COUNT(*) FROM bookings WHERE group_id = :gid AND is_group_lead = true` returns `1`.
  - Individual room total amounts (₹5,000 each) sum to `grand_total = ₹15,000`.

### Scenario 3: Concurrent Booking Attempts for Same Room
- **Action:**
  - Client A starts transaction: calls `create_group_booking_atomic` on Room 101.
  - Client B concurrently starts transaction: calls `create_group_booking_atomic` on Room 101 for overlapping dates.
  - Client A commits.
- **Database Checks:**
  - Client B is serialized behind Client A via `SELECT * FROM rooms WHERE id = ANY(...) ORDER BY id FOR UPDATE`.
  - Client B's transaction throws `ROOM_UNAVAILABLE`.
  - Database contains exactly 1 booking for Room 101 during the requested dates.

### Scenario 4: Atomic Rollback on Partial Unavailability
- **Action:**
  - Room 102 is already booked for `2026-12-20` to `2026-12-22`.
  - Multi-room booking attempted for `[Room 101, Room 102, Room 103]` for the same dates.
- **Database Checks:**
  - PostgreSQL transaction aborts with `ROOM_UNAVAILABLE: Room "Room 102" is already booked`.
  - Room 101 and Room 103 have ZERO new booking rows inserted.

### Scenario 5: Consolidated Invoice Creation
- **Action:**
  - Call `create_invoice_with_items` referencing the lead booking ID of the 3-room group.
  - Line items payload contains entries for Room 101, Room 102, and Room 103.
- **Database Checks:**
  - `invoices.group_id` equals the booking's `group_id`.
  - `invoices.subtotal` = ₹15,000.00, `invoices.grand_total` = ₹15,000.00, `invoices.balance_due` = ₹15,000.00.
  - `invoice_items` contains 3 rows linked to `invoice.id`.

### Scenario 6: Duplicate Active Group Invoice Prevention
- **Action:**
  - Attempt to invoke `create_invoice_with_items` or execute direct `INSERT INTO invoices` with the same `(homestay_id, group_id)` and `status != 'cancelled'`.
- **Database Checks:**
  - Call fails with error `DUPLICATE_GROUP_INVOICE` or unique constraint violation on `uq_invoices_active_group` (SQLSTATE `23505`).
  - Active invoice count for the group remains strictly `1`.

### Scenario 7: Partial Payments & Balance Reconciliation
- **Action:**
  - Call `record_invoice_payment(invoice_id, 5000.00, 'upi', ...)`.
  - Call `record_invoice_payment(invoice_id, 10000.00, 'cash', ...)`.
- **Database Checks:**
  - After payment 1: `invoices.amount_paid` = ₹5,000.00, `invoices.balance_due` = ₹10,000.00, `invoices.status` = `'partially_paid'`.
  - After payment 2: `invoices.amount_paid` = ₹15,000.00, `invoices.balance_due` = ₹0.00, `invoices.status` = `'paid'`.
  - `payments` ledger contains 2 immutable entries; zero ledger mutation violations.

### Scenario 8: Room-Level Cancellation
- **Action:**
  - Execute `UPDATE bookings SET status = 'cancelled' WHERE id = :room3_booking_id`.
- **Database Checks:**
  - Room 3 row status is `'cancelled'`.
  - Sibling Room 1 and Room 2 bookings remain `'confirmed'`.
  - Room 3 is immediately available to be booked by another party for those dates.

### Scenario 9: Rollback Migration Safety
- **Action:**
  - Execute `scripts/migration_group_bookings_rollback.sql`.
- **Database Checks:**
  - `create_group_booking_atomic` is dropped.
  - `create_invoice_with_items` is restored to Phase 2 (without `group_id`).
  - `uq_invoices_active_group` and group indexes are dropped.
  - `group_id` and `is_group_lead` columns are dropped.
  - Single-room invoice creation works normally with the restored Phase 2 RPC.

---

## 5. Execution Instructions

### Local Disposable PostgreSQL Cluster (Recommended for local dev)
Runs an ephemeral, isolated PostgreSQL 18 cluster with trust authentication on port 54333, runs all 9 scenarios, and destroys the cluster upon completion:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/run_dev_group_bookings_test.ps1
```

### Dedicated Development Supabase / PostgreSQL Instance
Provide standard environment variables pointing to your development database:
```powershell
$env:DEV_PGHOST = "127.0.0.1"
$env:DEV_PGPORT = "5432"
$env:DEV_PGUSER = "postgres"
$env:DEV_PGPASSWORD = "your_dev_password"
$env:DEV_PGDATABASE = "your_dev_db"

node scripts/test_dev_database_group_bookings.mjs
```

---

## 6. Distinction Between Test Levels

| Aspect | Mock / In-Memory Suite (`test_group_bookings_suite.mjs`) | Real PostgreSQL Integration Suite (`test_dev_database_group_bookings.mjs`) |
|---|---|---|
| **Engine** | Node.js process with in-memory JavaScript objects | Real PostgreSQL 18 database engine via TCP socket (`pg`) |
| **Concurrency** | Simulated sequence with JavaScript promises | Real parallel TCP connections with `FOR UPDATE` lock blocking |
| **Constraints** | JavaScript logic checks | Real PostgreSQL partial unique indexes (`uq_invoices_active_group`) |
| **Transactions** | JS arrays / Map state | Real ACID transactions (`BEGIN`, `COMMIT`, `ROLLBACK`) |
| **Triggers** | Simulated calculation helpers | Real PL/pgSQL database triggers (`trg_sync_invoice_from_payments`) |
| **Migrations** | Not executed | Real `.sql` files executed directly by PostgreSQL server |

